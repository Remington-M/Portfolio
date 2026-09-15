"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { asset } from "@/lib/asset";
import {
  DEVELOP,
  FRAG,
  FRAG_BLUR,
  FRAG_COMPOSITE,
  MESH,
  POLAROID_MOTION as M,
  PRINT,
  SHADOW,
  VERT,
  VERT_QUAD,
  buildMesh,
} from "@/lib/polaroid";
import {
  clamp,
  isAtRest,
  kickSpring,
  spring,
  springConfig,
  stepSpring,
  REST,
} from "@/lib/spring";
import { onPolaroidFlip, onPolaroidReplay, polaroidTune as T } from "@/lib/polaroidTuning";

type Props = {
  /** The picture. Anything under `public/`; cropped to the square window. */
  src: string;
  alt: string;
  /** What is written on the back. One entry per line. */
  back: readonly string[];
  /** Card width in CSS pixels. Height follows the print's proportions. */
  width: number;
  /**
   * Resting lean, in degrees. A print put down on a table is never quite
   * square to it; this is where the roll spring settles.
   */
  lean?: number;
};

/**
 * A Polaroid that develops when it arrives and turns over when tapped.
 *
 * The picture is a mesh, not a rectangle — see `lib/polaroid.ts` for why —
 * and this component is the frame loop that drives it: it steps the springs,
 * hands the results to the shaders as uniforms, and draws. The loop runs
 * only while something is in motion; at rest the canvas is a still image
 * costing nothing.
 *
 * The DOM underneath is the real content. A button carries the picture and
 * the caption for anyone not looking at the canvas, and if WebGL is missing
 * or the context is lost the same button becomes a flat CSS flip of the same
 * two faces, with the development approximated in CSS filters.
 */
export default function Polaroid({ src, alt, back, width, lean = 0 }: Props) {
  const reduced = useReducedMotion() ?? false;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [flipped, setFlipped] = useState(false);
  /** Half turns so far, for the CSS fallback's own rotation. */
  const [turns, setTurns] = useState(0);
  /**
   * `pending` until the canvas has been tried, so the fallback is not shown
   * for a frame under a canvas that is about to work.
   */
  const [mode, setMode] = useState<"pending" | "gl" | "css">("pending");
  const flipTarget = useRef(0);
  const controls = useRef<{
    flip: (to: number) => void;
    tilt: (x: number, y: number) => void;
    resize: () => void;
    replay: () => void;
  } | null>(null);

  const height = width * PRINT.h;
  const canvasW = Math.round(width * PRINT.margin.x);
  const canvasH = Math.round(height * PRINT.margin.y);
  /**
   * The frame loop reads the size from here rather than closing over it, so
   * a resize — a phone turning over — re-sizes the canvas in place instead of
   * remounting the print and developing it all over again.
   */
  const dims = useRef({ width, canvasW, canvasH });
  dims.current = { width, canvasW, canvasH };
  useEffect(() => {
    controls.current?.resize();
  }, [width]);

  /**
   * Every tap adds another half turn in the same direction, so a print
   * turned to its back comes round the rest of the way rather than turning
   * back the way it came.
   */
  const toggle = useCallback(() => {
    const to = flipTarget.current + T.flipDir * Math.PI;
    flipTarget.current = to;
    const n = Math.round(to / Math.PI);
    setFlipped(Math.abs(n) % 2 === 1);
    setTurns(n);
    controls.current?.flip(to);
  }, []);
  /* The tuning panel can ask for a turn, or for the arrival again. */
  useEffect(() => onPolaroidFlip(toggle), [toggle]);
  useEffect(() => onPolaroidReplay(() => controls.current?.replay()), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
    });
    if (!gl) {
      setMode("css");
      return;
    }
    const program = compile(gl, VERT, FRAG);
    const blurProgram = compile(gl, VERT_QUAD, FRAG_BLUR);
    const compProgram = compile(gl, VERT_QUAD, FRAG_COMPOSITE);
    if (!program || !blurProgram || !compProgram) {
      setMode("css");
      return;
    }
    setMode("gl");

    /* ---------------- geometry ---------------- */
    const mesh = buildMesh(MESH.cols, MESH.rows);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.uv, gl.STATIC_DRAW);
    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.index, gl.STATIC_DRAW);
    /* A full-screen triangle for the blur and composite passes. */
    const quadVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadVbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPosBlur = gl.getAttribLocation(blurProgram, "aPos");
    const aPosComp = gl.getAttribLocation(compProgram, "aPos");
    const uBlurTex = gl.getUniformLocation(blurProgram, "uTex");
    const uBlurStep = gl.getUniformLocation(blurProgram, "uStep");
    const uCompTex = gl.getUniformLocation(compProgram, "uTex");
    const uCompColor = gl.getUniformLocation(compProgram, "uColor");
    const uCompAlpha = gl.getUniformLocation(compProgram, "uAlpha");
    const uCompShift = gl.getUniformLocation(compProgram, "uShift");

    /**
     * Offscreen targets for the shadow: a ping-pong pair per layer, each
     * pair sized so the layer's blur is a few texels wide. A Gaussian is
     * only smooth when its taps are close together, so a wide blur is done
     * on a small texture and scaled up, never with a wide stride on a big
     * one — that under-samples, and the shadow comes out gridded.
     */
    type Target = { fbo: WebGLFramebuffer; tex: WebGLTexture };
    type Pair = { a: Target; b: Target; w: number; h: number; sigma: number };
    const pairs: Pair[] = [];
    const makeTarget = (w: number, h: number): Target | null => {
      const tex = gl.createTexture();
      const fbo = gl.createFramebuffer();
      if (!tex || !fbo) return null;
      // On the blur's own unit: binding on whichever unit happens to be
      // active would replace the photo or the back of the print.
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      if (!ok) {
        gl.deleteTexture(tex);
        gl.deleteFramebuffer(fbo);
        return null;
      }
      return { fbo, tex };
    };
    const freeTargets = () => {
      for (const p of pairs) {
        for (const t of [p.a, p.b]) {
          gl.deleteTexture(t.tex);
          gl.deleteFramebuffer(t.fbo);
        }
      }
      pairs.length = 0;
    };
    /**
     * Two passes each way with the kernel's own sigma of two texels gives
     * a total sigma of 2√2 texels; each layer's texture is scaled so its
     * blur in pixels comes to that. Rebuilt when the size or the softness
     * changes.
     */
    const SIGMA_TEXELS = 2 * Math.SQRT2;
    let pairsKey = "";
    const sizeTargets = (w: number, h: number, pxPerCard: number, soft: number) => {
      const key = `${w}:${h}:${pxPerCard.toFixed(1)}:${soft.toFixed(3)}`;
      if (key === pairsKey && pairs.length === SHADOW.layers.length) return;
      pairsKey = key;
      freeTargets();
      for (const layer of SHADOW.layers) {
        const sigmaPx = Math.max(0.5, layer.blur * soft * pxPerCard);
        const scale = clamp(SIGMA_TEXELS / sigmaPx, 1 / 64, SHADOW.scale);
        const tw = Math.max(2, Math.round(w * scale));
        const th = Math.max(2, Math.round(h * scale));
        const a = makeTarget(tw, th);
        const b = makeTarget(tw, th);
        if (!a || !b) {
          freeTargets();
          break;
        }
        pairs.push({ a, b, w: tw, h: th, sigma: sigmaPx * scale });
      }
      gl.activeTexture(gl.TEXTURE0);
    };

    gl.useProgram(program);
    const aUV = gl.getAttribLocation(program, "aUV");
    const aH = gl.getAttribLocation(program, "aH");
    const aDir = gl.getAttribLocation(program, "aDir");

    /** Bind the sheet, with its face offset as a constant attribute. */
    const useSheet = (h: number) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.enableVertexAttribArray(aUV);
      gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 0, 0);
      gl.disableVertexAttribArray(aH);
      gl.vertexAttrib1f(aH, h);
      gl.disableVertexAttribArray(aDir);
      gl.vertexAttrib2f(aDir, 0, 0);
    };

    const u = (name: string) => gl.getUniformLocation(program, name);
    const U = {
      card: u("uCard"),
      angleTop: u("uAngleTop"),
      angleBottom: u("uAngleBottom"),
      bendX: u("uBendX"),
      bendY: u("uBendY"),
      tilt: u("uTilt"),
      roll: u("uRoll"),
      scale: u("uScale"),
      pos: u("uPos"),
      camera: u("uCamera"),
      proj: u("uProj"),
      shadow: u("uShadow"),
      shadowOffset: u("uShadowOffset"),
      thick: u("uThick"),
      wall: u("uWall"),
      curl: u("uCurl"),
      curlLen: u("uCurlLen"),
      shadowSlope: u("uShadowSlope"),
      photo: u("uPhoto"),
      back: u("uBack"),
      window: u("uWindow"),
      fit: u("uFit"),
      radius: u("uRadius"),
      develop: u("uDevelop"),
      paper: u("uPaper"),
      opacity: u("uOpacity"),
      camPos: u("uCamPos"),
    };

    gl.uniform2f(U.card, PRINT.w, PRINT.h);
    gl.uniform1f(U.camera, PRINT.camera);
    gl.uniform3f(U.camPos, 0, 0, PRINT.camera);
    gl.uniform4f(
      U.window,
      PRINT.window.x0,
      PRINT.window.y0,
      PRINT.window.x1,
      PRINT.window.y1,
    );
    gl.uniform1f(U.radius, PRINT.radius);
    gl.uniform1f(U.thick, PRINT.thickness);
    gl.uniform3f(U.paper, 0.968, 0.962, 0.948);
    gl.uniform1i(U.photo, 0);
    gl.uniform1i(U.back, 1);

    /* ---------------- textures ---------------- */
    const photoTex = makeTexture(gl, 0);
    const backTex = makeTexture(gl, 1);
    // A neutral grey until the picture arrives, so nothing flashes.
    solid(gl, photoTex, 0, [150, 146, 140]);
    solid(gl, backTex, 1, [30, 29, 27]);
    gl.uniform2f(U.fit, 1, 1);

    /**
     * Anisotropic filtering, where the driver offers it. A print seen at a
     * grazing angle is a texture minified far more along one axis than the
     * other, and plain mipmaps blur it; this keeps the caption's letters
     * sharp through the turn.
     */
    const aniso =
      gl.getExtension("EXT_texture_filter_anisotropic") ||
      gl.getExtension("WEBKIT_EXT_texture_filter_anisotropic");
    const anisoMax = aniso
      ? Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number)
      : 0;

    let photoReady = false;
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (dead) return;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, photoTex);
      upload(gl, potCopy(img, img.naturalWidth, img.naturalHeight), aniso, anisoMax);
      // Cover-fit the picture into the square window.
      const a = img.naturalWidth / img.naturalHeight;
      gl.uniform2f(U.fit, a > 1 ? 1 / a : 1, a > 1 ? 1 : a);
      photoReady = true;
      wake();
    };
    img.src = asset(src);

    let backDrawn = false;
    void drawBack(back).then((surface) => {
      if (dead || !surface) return;
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, backTex);
      upload(gl, potCopy(surface, surface.width, surface.height), aniso, anisoMax);
      backDrawn = true;
      wake();
    });

    /* ---------------- springs ---------------- */
    const restRoll = (lean * Math.PI) / 180;
    const S = {
      top: spring(0),
      bottom: spring(0),
      flexX: spring(0),
      flexY: spring(0),
      tiltX: spring(0),
      tiltY: spring(0),
      scale: spring(1),
      fade: spring(1),
      /** The curl, as a multiple of its rest; large on arrival. */
      curlIn: spring(1),
      roll: spring(restRoll),
    };
    const target = { flip: flipTarget.current, tiltX: 0, tiltY: 0 };
    let landedAt: number | null = null;
    let develop = 0;
    /** When the arrival may begin; the print holds invisible until then. */
    let startAt = 0;
    /** The arrival from the top: small, clear, over-curled. */
    const arrive = () => {
      startAt = performance.now() + T.entryDelay * 1000;
      if (reduced) {
        S.scale.value = 1;
        S.fade.value = 1;
        S.curlIn.value = 1;
        landedAt = performance.now();
        develop = 1;
        return;
      }
      S.scale.value = T.entryFromScale;
      S.scale.velocity = 0;
      S.fade.value = 0;
      S.fade.velocity = 0;
      // From nearly flat, kicked upward: it rises through its rest to a
      // peak and settles back, rather than starting curled and relaxing.
      S.curlIn.value = T.entryFromCurl;
      S.curlIn.velocity = T.entryCurlKick;
      landedAt = null;
      develop = 0;
    };
    arrive();

    /* ---------------- sizing ---------------- */
    let dpr = 1;
    let proj: [number, number] = [1, 1];
    const size = () => {
      /**
       * Drawn at one and a half times the display's own density, up to three
       * pixels per CSS pixel, and scaled down by the browser. MSAA covers the
       * outline; the extra resolution is for the edge strip and the texture
       * detail through a turn, which are where a bare 2x showed its pixels.
       */
      dpr = Math.min((window.devicePixelRatio || 1) * 1.5, 3);
      const { width, canvasW, canvasH } = dims.current;
      const w = Math.round(canvasW * dpr);
      const h = Math.round(canvasH * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
      // Pixels per card unit, then clip units per pixel.
      const px = width * dpr;
      proj = [(px * 2) / w, (px * 2) / h];
      gl.useProgram(program);
      gl.uniform2f(U.proj, proj[0], proj[1]);
      sizeTargets(w, h, px, T.shadowSoft);
    };
    size();

    controls.current = {
      flip: (to) => {
        target.flip = to;
        if (!reduced) kickSpring(S.flexX, T.flexKickTurn);
        wake();
      },
      tilt: (x, y) => {
        target.tiltX = x;
        target.tiltY = y;
        wake();
      },
      resize: () => {
        size();
        wake();
      },
      replay: () => {
        arrive();
        wake();
      },
    };

    /* ---------------- theme ---------------- */
    // The site's shadow tokens, resolved: warm brown in light, black in dark.
    let shadowColor: [number, number, number] = [0.08, 0.07, 0.06];
    const theme = () => {
      const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      shadowColor = dark ? [0, 0, 0] : [0.08, 0.07, 0.06];
      return dark ? 1.55 : 1;
    };
    let shadowGain = theme();
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onTheme = () => {
      shadowGain = theme();
      wake();
    };
    mql.addEventListener?.("change", onTheme);

    /* ---------------- the loop ---------------- */
    let raf = 0;
    let last = 0;
    let dead = false;

    const draw = (now: number) => {
      const dt = last ? Math.min((now - last) / 1000, 0.064) : 1 / 60;
      last = now;

      /* Springs are built from the live tuning each frame, so the panel's
       * sliders take effect on the next turn without a rebuild. */
      const flipCfg = reduced ? M.reduced : springConfig(T.topStiffness, T.topRatio);
      const bottomCfg = reduced ? M.reduced : springConfig(T.bottomStiffness, T.bottomRatio);
      const flexCfg = springConfig(T.flexStiffness, T.flexRatio);
      stepSpring(S.top, target.flip, dt, flipCfg, REST.unit);
      stepSpring(S.bottom, target.flip, dt, bottomCfg, REST.unit);
      stepSpring(S.flexX, 0, dt, flexCfg, REST.unit);
      stepSpring(S.flexY, 0, dt, flexCfg, REST.unit);
      stepSpring(S.tiltX, target.tiltX, dt, M.tilt, REST.unit);
      stepSpring(S.tiltY, target.tiltY, dt, M.tilt, REST.unit);
      // The arrival waits out its delay with the print held invisible.
      const arriving = now >= startAt;
      if (arriving) {
        stepSpring(S.scale, 1, dt, springConfig(T.entryScaleStiffness, T.entryScaleRatio), REST.unit);
        stepSpring(S.fade, 1, dt, springConfig(T.entryFadeStiffness, 1), REST.unit);
        stepSpring(S.curlIn, 1, dt, springConfig(T.entryCurlStiffness, T.entryCurlRatio), REST.unit);
      }
      stepSpring(S.roll, restRoll, dt, M.tilt, REST.unit);

      // The landing: once the print is nearly at size, flex the sheet and
      // start the clock on the chemistry.
      if (landedAt === null && arriving && Math.abs(S.scale.value - 1) < 0.04) {
        landedAt = now;
        kickSpring(S.flexY, T.flexKickLand);
      }
      if (landedAt !== null && photoReady) {
        develop = clamp(
          (now - landedAt) / 1000 - DEVELOP.delay,
          0,
          DEVELOP.duration,
        ) / DEVELOP.duration;
      }

      const mean = (S.top.value + S.bottom.value) / 2;
      const lift = Math.abs(Math.sin(mean)) * T.lift;
      const bendX = S.flexX.value * 0.1;
      const bendY = S.flexY.value * 0.1;
      /**
       * The curl through the turn. `cos` of the turn is 1 with the picture
       * up, 0 side-on and -1 with the back up: the resting curl follows it
       * down to nothing on the back, and the through-turn curl rides sin²,
       * peaking side-on and gone well before either face — squared so the
       * print's ring as it settles on its back, a few degrees each way,
       * does not keep bringing a bend back with every swing.
       */
      const swing = Math.sin(mean);
      // The resting curl is gated on cos³, not cos: with cos alone it came
      // back while the print was still nearly edge-on to the camera on the
      // way round to the front, so the corner's lift pointed sideways and
      // showed the black underside as a dark edge. Cubed, it only arrives
      // once the print is nearly face-on, where a lift is toward the eye.
      const facing = Math.max(0, Math.cos(mean));
      const curl =
        T.curl * S.curlIn.value * facing * facing * facing + T.curlThrough * swing * swing;
      // Capped short of the corner rolling right over onto the sheet.
      gl.uniform1f(U.curl, Math.min(2.9, reduced ? T.curl * facing : curl));
      gl.uniform1f(U.curlLen, T.curlLength);

      gl.uniform1f(U.angleTop, S.top.value);
      gl.uniform1f(U.angleBottom, S.bottom.value);
      gl.uniform1f(U.bendX, bendX);
      gl.uniform1f(U.bendY, bendY);
      gl.uniform2f(U.tilt, S.tiltX.value, S.tiltY.value);
      gl.uniform1f(U.roll, S.roll.value);
      gl.uniform1f(U.scale, S.scale.value);
      gl.uniform3f(U.pos, 0, 0, lift);
      gl.uniform1f(U.develop, develop);
      gl.uniform1f(U.opacity, S.fade.value);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      /**
       * The shadow, blurred. For each layer: the sheet's silhouette, thrown
       * onto the table by height, into an offscreen target; a Gaussian
       * across it, sideways then down; then the result laid on the table.
       * Layers go furthest first, so the tight contact shadow paints last.
       */
      const height = lift + Math.max(0, S.scale.value - 1);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      {
        const { canvasW, canvasH, width } = dims.current;
        const fullW = Math.round(canvasW * dpr), fullH = Math.round(canvasH * dpr);
        // The softness slider changes the sizes the layers want.
        sizeTargets(fullW, fullH, width * dpr, T.shadowSoft);
      }
      if (pairs.length === SHADOW.layers.length) {
        const [dx, dy] = SHADOW.dir;
        const { canvasW, canvasH } = dims.current;
        const fullW = Math.round(canvasW * dpr), fullH = Math.round(canvasH * dpr);
        for (let k = SHADOW.layers.length - 1; k >= 0; k--) {
          const layer = SHADOW.layers[k];
          const pr = pairs[k];
          // 1. Silhouette, at the layer's own size.
          gl.bindFramebuffer(gl.FRAMEBUFFER, pr.a.fbo);
          gl.viewport(0, 0, pr.w, pr.h);
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.disable(gl.BLEND);
          gl.useProgram(program);
          gl.uniform1f(U.wall, 0);
          gl.uniform1f(U.shadow, 1);
          gl.uniform3f(U.shadowOffset, 0, 0, 0);
          const reach = layer.reach * T.shadowThrow;
          gl.uniform2f(U.shadowSlope, dx * reach, dy * reach);
          useSheet(0);
          gl.drawElements(gl.TRIANGLES, mesh.index.length, gl.UNSIGNED_SHORT, 0);
          gl.uniform1f(U.shadow, 0);
          // 2. Blur: two passes each way, at a stride of one texel or a
          //    little under, so the kernel is always well sampled.
          const stride = clamp(pr.sigma / SIGMA_TEXELS, 0.25, 1);
          gl.useProgram(blurProgram);
          gl.bindBuffer(gl.ARRAY_BUFFER, quadVbo);
          gl.enableVertexAttribArray(aPosBlur);
          gl.vertexAttribPointer(aPosBlur, 2, gl.FLOAT, false, 0, 0);
          gl.activeTexture(gl.TEXTURE2);
          gl.uniform1i(uBlurTex, 2);
          for (let pass = 0; pass < 2; pass++) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, pr.b.fbo);
            gl.bindTexture(gl.TEXTURE_2D, pr.a.tex);
            gl.uniform2f(uBlurStep, stride / pr.w, 0);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            gl.bindFramebuffer(gl.FRAMEBUFFER, pr.a.fbo);
            gl.bindTexture(gl.TEXTURE_2D, pr.b.tex);
            gl.uniform2f(uBlurStep, 0, stride / pr.h);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
          }
          // 3. Onto the table, shifted by the layer's rest throw, fading as
          //    the print comes away from the table.
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          gl.viewport(0, 0, fullW, fullH);
          gl.enable(gl.BLEND);
          gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
          gl.useProgram(compProgram);
          gl.enableVertexAttribArray(aPosComp);
          gl.vertexAttribPointer(aPosComp, 2, gl.FLOAT, false, 0, 0);
          gl.uniform1i(uCompTex, 2);
          gl.bindTexture(gl.TEXTURE_2D, pr.a.tex);
          gl.uniform3f(uCompColor, shadowColor[0], shadowColor[1], shadowColor[2]);
          const a = layer.alpha * T.shadowAlpha;
          gl.uniform1f(
            uCompAlpha,
            clamp(a * (1 - height * 0.8), a * 0.2, a) * shadowGain * S.fade.value,
          );
          // Clip units to uv: half the projected offset.
          gl.uniform2f(uCompShift, dx * layer.offset * proj[0] * 0.5, dy * layer.offset * proj[1] * 0.5);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
        gl.disableVertexAttribArray(aPosBlur);
        gl.disableVertexAttribArray(aPosComp);
        gl.activeTexture(gl.TEXTURE0);
        gl.useProgram(program);
      }

      gl.enable(gl.DEPTH_TEST);
      gl.uniform1f(U.shadow, 0);
      // The two faces, each drawn one-sided, on the same sheet. There is no
      // edge strip between them: the print is a sheet with two sides, and a
      // drawn thickness kept showing as a line along whichever edge lifted.
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);
      useSheet(0);
      gl.drawElements(gl.TRIANGLES, mesh.index.length, gl.UNSIGNED_SHORT, 0);
      gl.cullFace(gl.FRONT);
      gl.drawElements(gl.TRIANGLES, mesh.index.length, gl.UNSIGNED_SHORT, 0);
      gl.disable(gl.CULL_FACE);

      const moving =
        !isAtRest(S.top, target.flip) ||
        !isAtRest(S.bottom, target.flip) ||
        !isAtRest(S.flexX, 0) ||
        !isAtRest(S.flexY, 0) ||
        !isAtRest(S.tiltX, target.tiltX) ||
        !isAtRest(S.tiltY, target.tiltY) ||
        !arriving ||
        !isAtRest(S.scale, 1) ||
        !isAtRest(S.fade, 1) ||
        !isAtRest(S.curlIn, 1) ||
        !isAtRest(S.roll, restRoll) ||
        (landedAt !== null && develop < 1) ||
        !backDrawn;
      raf = moving ? requestAnimationFrame(draw) : 0;
      if (!moving) last = 0;
    };

    const wake = () => {
      if (dead || raf) return;
      raf = requestAnimationFrame(draw);
    };
    wake();

    const onResize = () => {
      size();
      wake();
    };
    window.addEventListener("resize", onResize);

    const onLost = (e: Event) => {
      e.preventDefault();
      dead = true;
      cancelAnimationFrame(raf);
      setMode("css");
    };
    canvas.addEventListener("webglcontextlost", onLost);

    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      controls.current = null;
      window.removeEventListener("resize", onResize);
      mql.removeEventListener?.("change", onTheme);
      canvas.removeEventListener("webglcontextlost", onLost);
      gl.deleteTexture(photoTex);
      gl.deleteTexture(backTex);
      gl.deleteBuffer(vbo);
      gl.deleteBuffer(ibo);
      gl.deleteBuffer(quadVbo);
      freeTargets();
      gl.deleteProgram(program);
      gl.deleteProgram(blurProgram);
      gl.deleteProgram(compProgram);
    };
    // Size is read live from `dims`; only the content and motion preference
    // rebuild the scene.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, back, reduced, lean]);

  /* ---------------- pointer ---------------- */
  const onMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (reduced || e.pointerType !== "mouse") return;
      const r = e.currentTarget.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width - 0.5) * 2;
      const y = ((e.clientY - r.top) / r.height - 0.5) * 2;
      // The side under the pointer comes up toward it (or down, away from
      // it, with `tiltToward` reversed).
      const k = T.tiltMax * T.tiltToward;
      controls.current?.tilt(-y * k, x * k);
    },
    [reduced],
  );
  const onLeave = useCallback(() => controls.current?.tilt(0, 0), []);


  const label = flipped
    ? "Turn the photo back over"
    : "Turn the photo over";

  return (
    <div
      style={{
        position: "relative",
        width,
        height,
        // The canvas is larger than the card so the swing has room. Nothing
        // else should shift for it, so it is centred over the card's box.
        margin: "0 auto",
      }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        width={canvasW}
        height={canvasH}
        style={{
          position: "absolute",
          left: (width - canvasW) / 2,
          // The card sits a little below the canvas centre: the drop comes
          // from above, and the shadow falls below.
          top: (height - canvasH) / 2 + canvasH * 0.04,
          width: canvasW,
          height: canvasH,
          pointerEvents: "none",
          display: mode === "css" ? "none" : "block",
        }}
      />
      <button
        type="button"
        onClick={toggle}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        aria-label={label}
        aria-pressed={flipped}
        className={mode === "css" ? "polaroid-css" : undefined}
        style={{
          position: "absolute",
          inset: 0,
          width,
          height,
          padding: 0,
          border: 0,
          background: "transparent",
          cursor: "pointer",
          font: "inherit",
          color: "inherit",
          touchAction: "manipulation",
          WebkitTapHighlightColor: "transparent",
          // In GL mode the button is the hit area and nothing else; the
          // faces below are for assistive tech and the CSS fallback.
          ...(mode === "css"
            ? { perspective: width * 4, borderRadius: 2 }
            : null),
        }}
      >
        <span
          className="polaroid-faces"
          aria-hidden={mode !== "css"}
          style={{
            transform:
              mode === "css" ? `rotate(${lean}deg) rotateY(${turns * 180}deg)` : undefined,
          }}
        >
          <span className="polaroid-face polaroid-front">
            <span className="polaroid-window">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={asset(src)} alt="" draggable={false} />
              <span className="polaroid-veil" />
            </span>
          </span>
          <span className="polaroid-face polaroid-back">
            {back.map((line, i) => (
              <span key={i}>{line}</span>
            ))}
          </span>
        </span>
        {/* What a screen reader gets, whichever way the canvas is drawn. */}
        <span className="polaroid-sr">
          {alt}. On the back: {back.join(", ")}.
        </span>
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * GL plumbing
 * ------------------------------------------------------------------ */
function compile(gl: WebGLRenderingContext, vert: string, frag: string): WebGLProgram | null {
  const shader = (type: number, source: string) => {
    const s = gl.createShader(type);
    if (!s) return null;
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      if (process.env.NODE_ENV !== "production") {
        console.error("Polaroid shader:", gl.getShaderInfoLog(s));
      }
      gl.deleteShader(s);
      return null;
    }
    return s;
  };
  const vs = shader(gl.VERTEX_SHADER, vert);
  const fs = shader(gl.FRAGMENT_SHADER, frag);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    if (process.env.NODE_ENV !== "production") {
      console.error("Polaroid program:", gl.getProgramInfoLog(program));
    }
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

/**
 * A texture that takes any size. WebGL 1 only mipmaps and repeats
 * power-of-two images; clamped and linear, a photo of any dimensions works.
 */
function makeTexture(gl: WebGLRenderingContext, unit: number): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return tex;
}

/**
 * WebGL 1 only mipmaps power-of-two textures, so anything drawn on the
 * print is resampled onto one first. The shader addresses both faces in
 * 0–1 uv, so a stretched copy maps back exactly.
 */
function potCopy(
  source: HTMLImageElement | HTMLCanvasElement,
  w: number,
  h: number,
): HTMLCanvasElement {
  const pot = (n: number) => Math.pow(2, Math.round(Math.log2(n)));
  const c = document.createElement("canvas");
  c.width = Math.min(2048, Math.max(512, pot(w)));
  c.height = Math.min(2048, Math.max(512, pot(h)));
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, c.width, c.height);
  return c;
}

function upload(
  gl: WebGLRenderingContext,
  surface: HTMLCanvasElement,
  aniso: EXT_texture_filter_anisotropic | null,
  anisoMax: number,
) {
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, surface);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.generateMipmap(gl.TEXTURE_2D);
  if (aniso && anisoMax > 1) {
    gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, anisoMax);
  }
}

function solid(
  gl: WebGLRenderingContext,
  tex: WebGLTexture,
  unit: number,
  rgb: [number, number, number],
) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGB,
    1,
    1,
    0,
    gl.RGB,
    gl.UNSIGNED_BYTE,
    new Uint8Array(rgb),
  );
}

/* ------------------------------------------------------------------ *
 * The back of the print
 *
 * Matte black paper with the pod ridge across the bottom, and the caption
 * set in the site's mono. Drawn on a 2D canvas so it can use the real
 * webfont, then handed to the shader as a texture.
 * ------------------------------------------------------------------ */
async function drawBack(lines: readonly string[]): Promise<HTMLCanvasElement | null> {
  const W = 1024;
  const H = Math.round(W * PRINT.h);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");
  if (!ctx) return null;

  const mono =
    getComputedStyle(document.documentElement)
      .getPropertyValue("--font-mono")
      .trim() || "ui-monospace, monospace";
  const px = (n: number) => (n / 88) * W;
  const labelFont = `500 ${px(3.1)}px ${mono}`;
  const valueFont = `400 ${px(3.1)}px ${mono}`;
  try {
    await Promise.all([
      document.fonts.load(labelFont),
      document.fonts.load(valueFont),
    ]);
  } catch {
    // Fall through with whatever the canvas can find.
  }

  // Paper.
  ctx.fillStyle = "#1b1a18";
  ctx.fillRect(0, 0, W, H);
  const grain = ctx.createImageData(W, H);
  const d = grain.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = 22 + Math.random() * 14;
    d[i] = v + 2;
    d[i + 1] = v + 1;
    d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(grain, 0, 0);
  // A soft fall-off toward the edges, where the sheet is folded over.
  const vignette = ctx.createRadialGradient(W / 2, H / 2, W * 0.2, W / 2, H / 2, W * 0.85);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.28)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);

  // The pod: a raised strip inside the wide border, with a lip on each edge.
  const podTop = H - px(19);
  const podH = px(9);
  ctx.fillStyle = "rgba(255,255,255,0.035)";
  ctx.fillRect(px(3), podTop, W - px(6), podH);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(px(3), podTop, W - px(6), 2);
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(px(3), podTop + podH - 2, W - px(6), 2);
  // Ribs across the top edge, where the rollers gripped.
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  for (let x = px(6); x < W - px(6); x += px(2.6)) {
    ctx.fillRect(x, px(2.2), 1, px(2.4));
  }

  // The caption.
  ctx.fillStyle = "rgba(226, 220, 208, 0.82)";
  ctx.textBaseline = "alphabetic";
  const left = px(9);
  let y = px(14);
  lines.forEach((line, i) => {
    ctx.font = i === 0 ? labelFont : valueFont;
    // Tracked like the site's labels: letter by letter.
    const track = px(i === 0 ? 0.32 : 0.12);
    let x = left;
    for (const ch of i === 0 ? line.toUpperCase() : line) {
      ctx.fillText(ch, x, y);
      x += ctx.measureText(ch).width + track;
    }
    y += px(i === 0 ? 6.4 : 5.2);
  });

  // The small print, low on the sheet.
  ctx.font = `400 ${px(2.2)}px ${mono}`;
  ctx.fillStyle = "rgba(226, 220, 208, 0.38)";
  ctx.fillText("INTEGRAL FILM \u00b7 79 \u00d7 79 MM", left, H - px(4.2));

  return c;
}
