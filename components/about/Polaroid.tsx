"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { asset } from "@/lib/asset";
import {
  DEVELOP,
  FRAG,
  MESH,
  POLAROID_MOTION as M,
  PRINT,
  VERT,
  buildMesh,
} from "@/lib/polaroid";
import {
  clamp,
  isAtRest,
  kickSpring,
  spring,
  stepSpring,
  REST,
  type Spring,
} from "@/lib/spring";

type Props = {
  /** The picture. Anything under `public/`; cropped to the square window. */
  src: string;
  alt: string;
  /** What is written on the back. One entry per line. */
  back: readonly string[];
  /** Card width in CSS pixels. Height follows the print's proportions. */
  width: number;
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
export default function Polaroid({ src, alt, back, width }: Props) {
  const reduced = useReducedMotion() ?? false;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [flipped, setFlipped] = useState(false);
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

  const toggle = useCallback(() => {
    const to = flipTarget.current > 0 ? 0 : Math.PI;
    flipTarget.current = to;
    setFlipped(to > 0);
    controls.current?.flip(to);
  }, []);

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
    const program = compile(gl);
    if (!program) {
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
    gl.useProgram(program);
    const aUV = gl.getAttribLocation(program, "aUV");
    gl.enableVertexAttribArray(aUV);
    gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 0, 0);

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
      photo: u("uPhoto"),
      back: u("uBack"),
      window: u("uWindow"),
      fit: u("uFit"),
      radius: u("uRadius"),
      develop: u("uDevelop"),
      shadowAlpha: u("uShadowAlpha"),
      shadowSoft: u("uShadowSoft"),
      shadowColor: u("uShadowColor"),
      paper: u("uPaper"),
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

    let photoReady = false;
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (dead) return;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, photoTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
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
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, surface);
      backDrawn = true;
      wake();
    });

    /* ---------------- springs ---------------- */
    const S = {
      top: spring(0),
      bottom: spring(0),
      flexX: spring(0),
      flexY: spring(0),
      tiltX: spring(0),
      tiltY: spring(0),
      y: spring(reduced ? 0 : M.entry.fromY),
      scale: spring(reduced ? 1 : M.entry.fromScale),
      roll: spring(reduced ? 0 : M.entry.fromRoll),
    };
    const target = { flip: flipTarget.current, tiltX: 0, tiltY: 0 };
    let landedAt: number | null = reduced ? performance.now() : null;
    let develop = reduced ? 1 : 0;

    /* ---------------- sizing ---------------- */
    let dpr = 1;
    const size = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
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
      gl.uniform2f(U.proj, (px * 2) / w, (px * 2) / h);
    };
    size();

    controls.current = {
      flip: (to) => {
        target.flip = to;
        if (!reduced) kickSpring(S.flexX, M.flexKick.turn * (to > 0 ? 1 : -1));
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
    };

    /* ---------------- theme ---------------- */
    const theme = () => {
      const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      // The site's shadow tokens, resolved: warm brown in light, black in dark.
      gl.uniform3f(U.shadowColor, dark ? 0 : 0.08, dark ? 0 : 0.07, dark ? 0 : 0.06);
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

      const flipCfg = reduced ? M.reduced : M.top;
      const bottomCfg = reduced ? M.reduced : M.bottom;
      stepSpring(S.top, target.flip, dt, flipCfg, REST.unit);
      stepSpring(S.bottom, target.flip, dt, bottomCfg, REST.unit);
      stepSpring(S.flexX, 0, dt, M.flex, REST.unit);
      stepSpring(S.flexY, 0, dt, M.flex, REST.unit);
      stepSpring(S.tiltX, target.tiltX, dt, M.tilt, REST.unit);
      stepSpring(S.tiltY, target.tiltY, dt, M.tilt, REST.unit);
      stepSpring(S.y, 0, dt, M.entry.y, REST.unit);
      stepSpring(S.scale, 1, dt, M.entry.scale, REST.unit);
      stepSpring(S.roll, 0, dt, M.entry.roll, REST.unit);

      // The landing: once the drop is nearly over, flex the sheet and start
      // the clock on the chemistry.
      if (landedAt === null && S.y.value < 0.06) {
        landedAt = now;
        kickSpring(S.flexY, M.flexKick.land);
      }
      if (landedAt !== null && photoReady) {
        develop = clamp(
          (now - landedAt) / 1000 - DEVELOP.delay,
          0,
          DEVELOP.duration,
        ) / DEVELOP.duration;
      }

      const mean = (S.top.value + S.bottom.value) / 2;
      const lift = Math.sin(clamp(mean, 0, Math.PI)) * M.lift;
      const bendX = S.flexX.value * 0.1;
      const bendY = S.flexY.value * 0.1;

      gl.uniform1f(U.angleTop, S.top.value);
      gl.uniform1f(U.angleBottom, S.bottom.value);
      gl.uniform1f(U.bendX, bendX);
      gl.uniform1f(U.bendY, bendY);
      gl.uniform2f(U.tilt, S.tiltX.value, S.tiltY.value);
      gl.uniform1f(U.roll, S.roll.value);
      gl.uniform1f(U.scale, S.scale.value);
      gl.uniform3f(U.pos, 0, S.y.value, lift);
      gl.uniform1f(U.develop, develop);

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      // Shadow first, without depth, thrown down and to the right and going
      // softer and fainter the further the card is from the table.
      const height = lift + Math.max(0, S.y.value) * 0.3 + (S.scale.value - 1);
      gl.disable(gl.DEPTH_TEST);
      gl.uniform1f(U.shadow, 1);
      gl.uniform3f(U.shadowOffset, 0.01 + height * 0.05, -0.028 - height * 0.12, -0.02);
      gl.uniform1f(U.shadowAlpha, clamp(0.3 - height * 0.24, 0.06, 0.3) * shadowGain);
      gl.uniform1f(U.shadowSoft, 0.035 + height * 0.16);
      gl.drawElements(gl.TRIANGLES, mesh.index.length, gl.UNSIGNED_SHORT, 0);

      gl.enable(gl.DEPTH_TEST);
      gl.uniform1f(U.shadow, 0);
      gl.drawElements(gl.TRIANGLES, mesh.index.length, gl.UNSIGNED_SHORT, 0);

      const moving =
        !isAtRest(S.top, target.flip) ||
        !isAtRest(S.bottom, target.flip) ||
        !isAtRest(S.flexX, 0) ||
        !isAtRest(S.flexY, 0) ||
        !isAtRest(S.tiltX, target.tiltX) ||
        !isAtRest(S.tiltY, target.tiltY) ||
        !isAtRest(S.y, 0) ||
        !isAtRest(S.scale, 1) ||
        !isAtRest(S.roll, 0) ||
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
      gl.deleteProgram(program);
    };
    // Size is read live from `dims`; only the content and motion preference
    // rebuild the scene.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, back, reduced]);

  /* ---------------- pointer ---------------- */
  const onMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (reduced || e.pointerType !== "mouse") return;
      const r = e.currentTarget.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width - 0.5) * 2;
      const y = ((e.clientY - r.top) / r.height - 0.5) * 2;
      // Tilt away from the pointer, the way a print pressed at one corner does.
      controls.current?.tilt(y * M.tiltMax, -x * M.tiltMax);
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
        data-flipped={flipped ? "" : undefined}
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
        <span className="polaroid-faces" aria-hidden={mode !== "css"}>
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
function compile(gl: WebGLRenderingContext): WebGLProgram | null {
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
  const vs = shader(gl.VERTEX_SHADER, VERT);
  const fs = shader(gl.FRAGMENT_SHADER, FRAG);
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
  const W = 704;
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
