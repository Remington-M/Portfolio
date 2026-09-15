import { springConfig } from "./spring";

/**
 * The Polaroid on the About page.
 *
 * Everything here is what makes it read as an object rather than a picture:
 * the proportions of the real print, the springs that turn it over, and the
 * two shaders — one that bends a sheet of geometry, one that develops the
 * picture on it.
 *
 * Why WebGL, and why no library for it.
 *
 * The ask is a print that FLEXES: a twist as it turns, a bend as it lands.
 * CSS 3D can only rotate a flat rectangle, and slicing the card into strips
 * to fake curvature leaves seams at every joint. A mesh is the honest answer,
 * and a single quad with a vertex shader is about two hundred lines of plain
 * WebGL 1 — which every browser this site targets has shipped since 2014.
 * Pulling in three.js for one bent rectangle would be a second animation
 * engine on the page, which the README already rules out for good reason.
 *
 * The springs are the repo's own integrator, stepped from a frame loop that
 * only runs while something is moving. Where WebGL is missing or lost, the
 * component falls back to a flat CSS flip of the same DOM, so the page never
 * depends on the shader to be complete.
 */

/* ------------------------------------------------------------------ *
 * The print
 *
 * Integral film (600 / i-Type): 88 × 107mm overall, a 79 × 79mm picture
 * window sitting 6mm from the top, with the wide border at the bottom where
 * the reagent pod lives. Authored in units of card width so the geometry is
 * independent of how large it is drawn.
 * ------------------------------------------------------------------ */
export const PRINT = {
  /** Width is the unit. */
  w: 1,
  h: 107 / 88,
  /** Picture window, as uv fractions of the card. */
  window: {
    x0: 4.5 / 88,
    x1: 1 - 4.5 / 88,
    /** uv y runs bottom to top. */
    y0: (107 - 6 - 79) / 107,
    y1: (107 - 6) / 107,
  },
  /** Corner radius, in card widths. The real thing is barely rounded. */
  radius: 1.4 / 88,
  /**
   * Thickness, in card widths. Real integral film is about 0.4mm, which at
   * this size is under a pixel; this is nearer 1.2mm, enough to see the edge
   * as the print turns, which is what makes it a thing and not a picture.
   */
  thickness: 0,
  /** How far inside the outline the edge strip sits, in card widths. */
  wallInset: 0.2 / 88,
  /** Distance from the camera to the table, in card widths. */
  camera: 3.6,
  /**
   * Room the canvas keeps around the card, as multiples of it: for the
   * swing, and for the shadow, which is thrown a long way down and to the
   * right and was being cut off by the canvas edge.
   */
  margin: { x: 2.4, y: 2.3 },
} as const;

/* ------------------------------------------------------------------ *
 * Motion
 *
 * The turn is two springs, not one. A tap flicks the card over from its
 * bottom edge, so the top edge leads and the bottom follows: the angle at any
 * row of the mesh is a blend of the two by height, and the difference between
 * them IS the twist. Both settle at a half turn, so the twist grows, peaks
 * mid-flip and unwinds as the print comes to rest — with the ring of the
 * looser spring showing as the wobble of a sheet of plastic that has just
 * stopped.
 * ------------------------------------------------------------------ */
export const POLAROID_MOTION = {
  /**
   * Which way a tap turns the print. -1 turns it the other way from the
   * first version, so the bottom-right corner — the curled one — comes up
   * toward the camera through the turn and its bend is seen.
   */
  flipDir: -1 as 1 | -1,
  /** The leading edge. Quick, with a little overshoot. */
  top: springConfig(62, 0.62),
  /** The trailing edge. Softer, so it lags and rings a little longer. */
  bottom: springConfig(42, 0.55),
  /**
   * How far the card lifts toward the camera through the turn, in card
   * widths at the half-way point. Without it the print would turn on the
   * spot like a coin; with it, it comes up off the table to be turned.
   */
  lift: 0.32,
  /**
   * Flexure. Curvature across the width, kicked by the tap and springing back
   * to flat — the inertia of the free edges lagging the push. Curvature along
   * the height is kicked by the landing.
   */
  flex: springConfig(44, 0.32),
  /**
   * The landing kick is off: the print no longer drops, and a bow along
   * its height as it reached size read as the corner's curl reversing.
   */
  flexKick: { turn: -2.2, land: 0 },
  /**
   * Pointer tilt on hover, in radians at the edge of the card. The side
   * under the pointer comes up toward it — the print drawn to the hand —
   * rather than being pressed down, which read as the card shying away.
   */
  tilt: springConfig(120, 0.9),
  tiltMax: 0.09,
  tiltToward: 1 as 1 | -1,
  /**
   * Arrival. The print scales up from a little small and fades in, and
   * its corner curls UP as it comes — from nearly flat, through its rest,
   * to a peak — and settles back down. The corner is what says this is a
   * print and not a picture, so the arrival shows it off. It used to drop
   * in from above the frame, which clipped at the top and read as falling
   * rather than appearing.
   */
  entry: {
    /** Seconds after the page is ready before the print starts to arrive. */
    delay: 0.4,
    /** Soft, with a gentle bounce. */
    scale: springConfig(40, 0.6),
    fade: springConfig(110, 1),
    curl: springConfig(12, 0.5),
    fromScale: 0.86,
    /** The curl at arrival, as a multiple of the resting curl. */
    fromCurl: 0,
    /** The upward kick on the curl at arrival, in multiples per second:
     *  what carries it past its rest to a peak before it settles. */
    curlKick: 12,
  },
  /**
   * A resting curl at the bottom-right corner: a real page curl, the sheet
   * rolled around a cylinder whose axis runs across the corner, through
   * this many radians at the corner itself. Length is kept, so the corner
   * travels back toward the fold as it lifts, the way paper does. Prints
   * never lie quite flat; this is the one that says so, and it is what the
   * shadow separates from.
   *
   * Front side up only. It fades out through a turn and is gone with the
   * back showing — a print's curl is toward its picture, so turned over the
   * corner points at the table and nothing bends toward the camera — and
   * it comes back as the picture does.
   */
  curl: 0.6,
  /** How much of the sheet is in the roll: the fold sits this far in from
   *  the corner along the diagonal, in card widths. */
  curlLength: 1.05,
  /**
   * Extra curl at the same corner through the middle of a turn, gone again
   * at either end: the free corner lagging the sheet as it is flicked over.
   * Radians, like `curl`.
   */
  curlThrough: 0.45,
  /** Reduced motion: one critically damped spring, no twist, no flex. */
  reduced: springConfig(160, 1),
} as const;

/* ------------------------------------------------------------------ *
 * Shadow
 *
 * A real blur. Each layer is the sheet's silhouette, dropped onto the table
 * along the light by every vertex's own height, rendered once to an
 * offscreen texture, blurred with a separable Gaussian, and drawn on the
 * table in the shadow's colour. Three layers in the deck's arrangement — a
 * tight contact shadow, a body, a long soft tail — each blurred on its own
 * and blended, which is what makes them read as one shadow: a true blur has
 * no edge to stack. The earlier version faded each layer inward from a hard
 * outline instead, and its layers read as separate passes with sharp,
 * square corners.
 * ------------------------------------------------------------------ */
export const SHADOW = {
  /**
   * The light, shared with the deck: high on the left, so shadows throw
   * down and to the right (LIGHT.azimuth on the home page is 64°, and this
   * is that direction in the print's y-up units).
   */
  dir: [0.44, -0.9] as const,
  /**
   * Throw per unit of height, in card widths. The lifted corner's shadow
   * has to travel OUT from under the corner as it lifts; too little and
   * the corner simply uncovers the shadow's edge.
   */
  throw: 4,
  /** Multipliers on every layer's blur and alpha. */
  soft: 1,
  alpha: 1,
  /**
   * The layers, generated on the deck's progression (see `deckShadow` in
   * design.ts, after the Beautiful Shadows plugin): the offset grows on a
   * quad-in curve, the blur on a quad-out curve, and the alpha falls on a
   * cubic in-out — so every layer past the first is fainter and softer
   * than the one before, and none has an edge with enough contrast to
   * read on its own. Three hand-placed layers did: each was a distinct
   * shape at a distinct offset, and they showed as three shadows.
   *
   * `reach` scales the height throw for that layer, `offset` is its rest
   * throw in card widths, `blur` its Gaussian sigma in card widths, `alpha`
   * its density.
   */
  layers: castLayers(6, 0.24, 0.11, 0.3),
  /** The offscreen textures are at most this fraction of the canvas. */
  scale: 0.5,
} as const;

/**
 * `count` layers (the first, empty one is dropped, as the plugin does),
 * reaching `offsetMax` card widths at rest and `blurMax` of sigma, from a
 * nearest alpha of `alpha0`.
 */
export function castLayers(count: number, offsetMax: number, blurMax: number, alpha0: number) {
  const out: { reach: number; offset: number; blur: number; alpha: number }[] = [];
  const tMax = (count - 1) / count;
  for (let i = 1; i < count; i++) {
    const t = i / count;
    const cubicInOut = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const quadIn = (t * t) / (tMax * tMax);
    const quadOut = (1 - (1 - t) * (1 - t)) / (1 - (1 - tMax) * (1 - tMax));
    out.push({
      reach: quadIn,
      offset: offsetMax * quadIn,
      // Steeper than the plugin's curve at the near end, so the first
      // layer is a genuinely tight contact shadow and the softness is
      // saved for the tail.
      blur: Math.max(0.006, blurMax * Math.pow(quadOut, 1.6)),
      alpha: alpha0 * (1 - cubicInOut),
    });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Development
 *
 * Seconds from the print landing to the picture being finished, and when it
 * starts. Real film takes ten to fifteen minutes to settle; the shader runs
 * the same sequence in eight seconds.
 * ------------------------------------------------------------------ */
export const DEVELOP = {
  delay: 0.2,
  duration: 8,
} as const;

/* ------------------------------------------------------------------ *
 * Mesh
 * ------------------------------------------------------------------ */
export const MESH = { cols: 40, rows: 48 } as const;

/**
 * A grid of uv pairs and the triangle strip that walks it.
 *
 * Indexed, so the twist and bends in the vertex shader are evaluated once per
 * vertex rather than once per triangle corner.
 */
export function buildMesh(cols: number, rows: number) {
  const uv = new Float32Array((cols + 1) * (rows + 1) * 2);
  let k = 0;
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      uv[k++] = i / cols;
      uv[k++] = j / rows;
    }
  }
  const index = new Uint16Array(cols * rows * 6);
  k = 0;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = j * (cols + 1) + i;
      const b = a + cols + 1;
      index[k++] = a;
      index[k++] = a + 1;
      index[k++] = b;
      index[k++] = a + 1;
      index[k++] = b + 1;
      index[k++] = b;
    }
  }
  return { uv, index };
}

/**
 * The edge of the print: a strip of quads around the rounded outline, each
 * vertex carrying the uv it sits at on the sheet, which face of the sheet it
 * belongs to (-0.5 or 0.5), and the outward direction in the sheet's plane.
 * The vertex shader places it on the deformed sheet, so the edge bends and
 * twists with the faces it joins.
 */
export function buildWalls(radius: number, w: number, h: number, inset = 0) {
  const pts: { x: number; y: number; nx: number; ny: number }[] = [];
  // Held a hair inside the faces' outline so the strip never shares a
  // pixel's depth with the face it meets — that seam z-fights otherwise, and
  // shows as a sparkle of white edge along the side of the back.
  const hw = w / 2 - inset, hh = h / 2 - inset, r = Math.max(radius - inset, 0.0005);
  const arc = 5;
  // Corners, anticlockwise from the top-right.
  const corners = [
    { cx: hw - r, cy: hh - r, a0: 0 },
    { cx: -hw + r, cy: hh - r, a0: Math.PI / 2 },
    { cx: -hw + r, cy: -hh + r, a0: Math.PI },
    { cx: hw - r, cy: -hh + r, a0: (3 * Math.PI) / 2 },
  ];
  for (const c of corners) {
    for (let i = 0; i <= arc; i++) {
      const a = c.a0 + (i / arc) * (Math.PI / 2);
      pts.push({ x: c.cx + Math.cos(a) * r, y: c.cy + Math.sin(a) * r, nx: Math.cos(a), ny: Math.sin(a) });
    }
  }
  const n = pts.length;
  // u, v, h, dx, dy — two vertices per point.
  const data = new Float32Array(n * 2 * 5);
  let k = 0;
  for (const p of pts) {
    for (const side of [-0.5, 0.5]) {
      data[k++] = p.x / w + 0.5;
      data[k++] = p.y / h + 0.5;
      data[k++] = side;
      data[k++] = p.nx;
      data[k++] = p.ny;
    }
  }
  const index = new Uint16Array(n * 6);
  k = 0;
  for (let i = 0; i < n; i++) {
    const a = i * 2, b = ((i + 1) % n) * 2;
    index[k++] = a; index[k++] = b; index[k++] = a + 1;
    index[k++] = b; index[k++] = b + 1; index[k++] = a + 1;
  }
  return { data, index };
}

/* ------------------------------------------------------------------ *
 * Shaders
 * ------------------------------------------------------------------ */

/**
 * The sheet.
 *
 * A flat quad in card units, curved by two curvatures, twisted by a rotation
 * about the vertical axis whose angle varies with height, tilted, rolled,
 * scaled and placed — then projected by a pinhole at `uCamera`. The normal is
 * taken by finite difference of the same function, so lighting follows every
 * deformation for free.
 *
 * `w` is the real depth, so the picture is interpolated perspective-correct
 * across the quad rather than affinely; the twist would swim otherwise.
 */
export const VERT = /* glsl */ `
attribute vec2 aUV;
attribute float aH;
attribute vec2 aDir;

uniform vec2 uCard;
uniform float uAngleTop;
uniform float uAngleBottom;
uniform float uBendX;
uniform float uBendY;
uniform vec2 uTilt;
uniform float uRoll;
uniform float uScale;
uniform vec3 uPos;
uniform float uCamera;
uniform vec2 uProj;
uniform float uShadow;
uniform vec3 uShadowOffset;
uniform float uThick;
uniform float uWall;
uniform float uCurl;
uniform float uCurlLen;
uniform vec2 uShadowSlope;

varying vec2 vUV;
varying vec3 vNormal;
varying vec3 vPos;
varying float vHeight;

vec3 surf(vec2 uv) {
  vec2 p = (uv - 0.5) * uCard;
  // Curvature about each axis, centred so bending never lifts the middle.
  float z = uBendX * (p.x * p.x - uCard.x * uCard.x / 12.0)
          + uBendY * (p.y * p.y - uCard.y * uCard.y / 12.0);
  // The page curl at the bottom-right corner. The sheet past a fold line
  // — the diagonal, uCurlLen in from the corner — is rolled around a
  // cylinder of radius uCurlLen / uCurl, so the corner itself has turned
  // through uCurl radians. Arc length is kept: a point d past the fold
  // lands R·sin(d/R) past it in the plane and R·(1 − cos(d/R)) above,
  // which is what makes it a bend and not a stretch. Flat when uCurl is 0.
  vec2 cn = normalize(vec2(1.0, -1.0));
  float sCorner = dot(vec2(uCard.x, -uCard.y) * 0.5, cn);
  float d = dot(p, cn) - (sCorner - uCurlLen);
  if (d > 0.0 && uCurl > 0.0005) {
    float R = uCurlLen / uCurl;
    float th = d / R;
    p -= cn * (d - R * sin(th));
    z += R * (1.0 - cos(th));
  }
  // The twist: a rotation about Y whose angle depends on the row.
  float a = mix(uAngleBottom, uAngleTop, uv.y);
  float ca = cos(a), sa = sin(a);
  vec3 q = vec3(p.x * ca + z * sa, p.y, -p.x * sa + z * ca);
  // Tilt toward the pointer: about X, then about Y.
  float cx = cos(uTilt.x), sx = sin(uTilt.x);
  q = vec3(q.x, q.y * cx - q.z * sx, q.y * sx + q.z * cx);
  float cy = cos(uTilt.y), sy = sin(uTilt.y);
  q = vec3(q.x * cy + q.z * sy, q.y, -q.x * sy + q.z * cy);
  // Roll, for the arrival.
  float cr = cos(uRoll), sr = sin(uRoll);
  q = vec3(q.x * cr - q.y * sr, q.x * sr + q.y * cr, q.z);
  q = q * uScale + uPos + uShadow * uShadowOffset;
  return q;
}

/** Drop a point onto the table along the light. */
vec3 dropOnTable(vec3 q) {
  return vec3(q.xy + max(q.z, 0.0) * uShadowSlope, -0.05);
}

void main() {
  vec3 p = surf(aUV);
  float e = 0.004;
  vec3 du = surf(aUV + vec2(e, 0.0)) - p;
  vec3 dv = surf(aUV + vec2(0.0, e)) - p;
  vec3 n = normalize(cross(du, dv));
  // Thickness: each face sits half the thickness off the sheet along its
  // normal, and the edge strip spans between them.
  p += n * aH * uThick;
  vNormal = uWall > 0.5 ? normalize(du * aDir.x + dv * aDir.y) : n;
  vUV = aUV;
  vHeight = max(p.z, 0.0);
  if (uShadow > 0.5) p = dropOnTable(p);
  vPos = p;
  float w = uCamera - p.z;
  gl_Position = vec4(p.xy * uProj * uCamera, (w - uCamera) * 0.2 * w, w);
}
`;

/**
 * The surface, and the chemistry.
 *
 * Front: one continuous sheet of clear plastic over a white border and the
 * picture window, so the gloss is the same everywhere on it. Back: matte
 * black paper, drawn on a canvas so the caption can use the site's own type.
 * Both are lit by one directional light with a Blinn-Phong highlight that
 * travels across the print as it turns — the thing that sells the flex.
 *
 * Development follows the order the dyes arrive in. Integral film starts
 * under an opacifier — the dark blue-green layer that shields the negative
 * from light — which clears as the reagent's alkalinity drops. Beneath it,
 * dye developers migrate up to the image layer at different rates: cyan
 * arrives first, then magenta, then yellow. Cyan absorbs red, so the first
 * ghost of a picture is a cold cyan monochrome; magenta pulls it to neutral
 * and yellow warms it last. The reagent spreads from the pod in the wide
 * border, so the bottom of the picture is a little ahead of the top, and it
 * spreads unevenly, so the whole thing comes up in blotches rather than as
 * one clean fade. Density builds as a power of the final value — how dye
 * actually accumulates — so contrast arrives with the colour rather than
 * before it, and a muddy low-contrast middle passes on the way.
 */
export const FRAG = /* glsl */ `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D uPhoto;
uniform sampler2D uBack;
uniform vec2 uCard;
uniform vec4 uWindow;
uniform vec2 uFit;
uniform float uRadius;
uniform float uDevelop;
uniform float uShadow;
uniform float uWall;
uniform vec3 uPaper;
uniform vec3 uCamPos;
uniform float uOpacity;

varying vec2 vUV;
varying vec3 vNormal;
varying vec3 vPos;
varying float vHeight;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  return 0.55 * vnoise(p) + 0.3 * vnoise(p * 2.3 + 1.7) + 0.15 * vnoise(p * 5.1 + 3.1);
}
float roundedBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

vec3 develop(vec3 target, vec2 st, float t) {
  // Reagent spreads up from the pod, a little unevenly. The unevenness is
  // kept broad and shallow — the earlier version let a fractal noise map
  // decide the timing, and the picture came up as blotches rather than as
  // a picture.
  // Timing follows the picture, not a noise map. Dye builds fastest where
  // there is most of it — the shadows — so the dark parts of the image come
  // out of the dark first and the highlights are the last to clear. A slight
  // lead at the pod end and a very broad, shallow unevenness sit under that.
  // Two clocks. The dye's runs ahead in the shadows, so the dark parts of
  // the picture are formed first; the opacifier's is nearly even, with a
  // small lead at the pod end. Tying the veil itself to the tones was tried
  // and reads as a negative: it uncovers the shadows while the dye there is
  // still thin and light.
  float tl = dot(target, vec3(0.299, 0.587, 0.114));
  float blot = fbm(st * 2.2);
  float lead = st.y * 0.05 + (blot - 0.5) * 0.03;
  float local = clamp((t - tl * 0.22 - lead) / 0.74, 0.0, 1.0);
  float localV = clamp((t - lead - (1.0 - tl) * 0.05) / 0.62, 0.0, 1.0);

  // The three dyes, close together. Staggered too far apart the shadows
  // come up bright cyan before the other two darken them, which reads as
  // a negative; kept this close, the early image is a cool monochrome that
  // warms, which is the real thing.
  float aC = smoothstep(0.02, 0.75, local);
  float aM = smoothstep(0.10, 0.85, local);
  float aY = smoothstep(0.18, 0.95, local);
  vec3 dye = vec3(pow(target.r, aC), pow(target.g, aM), pow(target.b, aY));

  // The muddy middle: low contrast, a little desaturated, warm-grey haze.
  float mid = 1.0 - local;
  float lum = dot(dye, vec3(0.299, 0.587, 0.114));
  dye = mix(dye, vec3(lum), mid * 0.45);
  dye = mix(dye, vec3(0.64, 0.60, 0.54), mid * 0.2);

  // The opacifier: one even veil that thins out, rather than a noise map
  // fading. What unevenness there is rides the same broad blot as the
  // timing, so the two agree, and it is a soft-light touch rather than a
  // hole in the dark.
  vec3 veil = vec3(0.045, 0.07, 0.08);
  // Starts lifting at once — it sat black too long when it eased in — and
  // eases only at the end.
  float clear = smoothstep(0.0, 0.55, localV);
  clear = 1.0 - (1.0 - clear) * (1.0 - clear);
  vec3 c = mix(veil, dye, clear);
  c *= 1.0 + (blot - 0.5) * 0.12 * mid * clear;

  // Grain, heavier while the image is coming up.
  float g = hash(floor(st * 820.0)) - 0.5;
  c += g * (0.01 + 0.035 * mid);

  // The print's own look, which stays: blacks that never quite reach black,
  // shadows that lean cool and highlights that lean warm, a little less
  // saturation than the file, and a soft fall-off at the corners.
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, 0.9);
  c = c * 0.93 + 0.04;
  c += (l - 0.5) * vec3(0.03, 0.01, -0.035);
  vec2 q = st - 0.5;
  c *= 1.0 - dot(q, q) * 0.16;
  return c;
}

void main() {
  vec2 p = (vUV - 0.5) * uCard;
  float d = roundedBox(p, uCard * 0.5, uRadius);

  if (uShadow > 0.5) {
    // The silhouette, for the blur: solid inside the outline, antialiased
    // at its edge. The blur is what makes it soft.
    float a = 1.0 - smoothstep(-0.003, 0.003, d);
    gl_FragColor = vec4(a);
    return;
  }

  float edge = uWall > 0.5 ? 1.0 : 1.0 - smoothstep(-0.004, 0.0, d);
  if (edge <= 0.0) discard;

  vec3 n = normalize(vNormal);
  // The faces are drawn one side at a time; the edge strip has its own
  // outward normal and is seen from both sides.
  if (uWall < 0.5 && !gl_FrontFacing) n = -n;
  vec3 v = normalize(uCamPos - vPos);
  // High on the left and well in front, the deck's light. In front enough
  // that the flat face carries the sheen rather than a lifted corner: a
  // corner curling up toward a raking light became one bright hotspot at
  // the bottom-right, the opposite of where the light was meant to read.
  vec3 l = normalize(vec3(-0.5, 0.75, 1.7));
  vec3 h = normalize(l + v);
  float ndl = max(dot(n, l), 0.0);
  float ndh = max(dot(n, h), 0.0);
  float fresnel = pow(1.0 - max(dot(n, v), 0.0), 3.0);

  vec3 base;
  float shine;
  float gloss;
  if (uWall > 0.5) {
    // The cut edge of the sheet: white plastic, a touch down from the
    // face. It is seen wherever an edge lifts toward the camera — a
    // curled corner, a hovered side — and has to read as the print's own
    // thickness: at the face's brightness it was a second white edge, and
    // darkened to hide that it became a black line instead.
    base = uPaper * 0.84;
    shine = 0.05;
    gloss = 8.0;
  } else if (gl_FrontFacing) {
    vec2 w0 = uWindow.xy, w1 = uWindow.zw;
    vec2 st = (vUV - w0) / (w1 - w0);
    bool inside = st.x > 0.0 && st.x < 1.0 && st.y > 0.0 && st.y < 1.0;
    // Paper, with the faint tooth of the white border.
    base = uPaper * (1.0 + (vnoise(vUV * 260.0) - 0.5) * 0.028);
    if (inside) {
      vec2 tc = (st - 0.5) * uFit + 0.5;
      // The picture is painted top-down; uv runs bottom-up.
      vec3 photo = texture2D(uPhoto, vec2(tc.x, 1.0 - tc.y)).rgb;
      vec3 pic = develop(photo, st, uDevelop);
      // The mask layer casts a hairline of shade onto the picture's edge.
      vec2 win = (w1 - w0) * uCard;
      vec2 e = min(st, 1.0 - st) * win;
      float rim = 1.0 - smoothstep(0.0, 0.012, min(e.x, e.y));
      pic *= 1.0 - rim * 0.22;
      base = pic;
    }
    shine = 0.11;
    gloss = 34.0;
  } else {
    // Seen from behind, so the back reads the right way round.
    base = texture2D(uBack, vec2(1.0 - vUV.x, 1.0 - vUV.y)).rgb;
    shine = 0.06;
    gloss = 9.0;
  }

  // The edge strip's normal faces sideways, so the lighting would darken
  // it further; it keeps a higher floor than the faces.
  vec3 c = base * (uWall > 0.5 ? 0.92 + 0.08 * ndl : 0.84 + 0.16 * ndl);
  // The highlight sits ON the surface rather than adding white to it: it
  // is scaled by how much headroom the colour has left, so a bright part
  // of the picture takes almost none and never clips. As the curl sweeps
  // the normals through the light, the sheen crosses the print instead of
  // blowing it out.
  float headroom = 1.0 - dot(c, vec3(0.299, 0.587, 0.114));
  float spec = pow(ndh, gloss) * shine * (0.7 + 0.3 * ndl);
  c += vec3(1.0) * spec * (0.35 + 0.65 * headroom);
  c += vec3(1.0) * fresnel * shine * 0.15 * headroom;
  // The sheen across the face: a broad fall from the top-left, where the
  // light is, to the bottom-right. Front face only; the back is matte.
  if (uWall < 0.5 && gl_FrontFacing) {
    float sweep = (vUV.y - vUV.x) * 0.5 + 0.5;
    c *= 0.955 + 0.09 * sweep;
  }

  gl_FragColor = vec4(c * edge, edge) * uOpacity;
}
`;

/**
 * A full-screen triangle, for the blur and composite passes.
 */
export const VERT_QUAD = /* glsl */ `
attribute vec2 aPos;
varying vec2 vUV;
void main() {
  vUV = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

/**
 * One direction of a separable Gaussian: thirteen taps, sigma of two steps,
 * with `uStep` the texel stride for the pass. A wide blur is a wide stride
 * over a linearly filtered texture rather than more taps.
 */
export const FRAG_BLUR = /* glsl */ `
precision mediump float;
uniform sampler2D uTex;
uniform vec2 uStep;
varying vec2 vUV;
void main() {
  float w0 = 0.19947, w1 = 0.17603, w2 = 0.12099, w3 = 0.06476,
        w4 = 0.02700, w5 = 0.00876, w6 = 0.00222;
  vec4 c = texture2D(uTex, vUV) * w0;
  c += (texture2D(uTex, vUV + uStep) + texture2D(uTex, vUV - uStep)) * w1;
  c += (texture2D(uTex, vUV + uStep * 2.0) + texture2D(uTex, vUV - uStep * 2.0)) * w2;
  c += (texture2D(uTex, vUV + uStep * 3.0) + texture2D(uTex, vUV - uStep * 3.0)) * w3;
  c += (texture2D(uTex, vUV + uStep * 4.0) + texture2D(uTex, vUV - uStep * 4.0)) * w4;
  c += (texture2D(uTex, vUV + uStep * 5.0) + texture2D(uTex, vUV - uStep * 5.0)) * w5;
  c += (texture2D(uTex, vUV + uStep * 6.0) + texture2D(uTex, vUV - uStep * 6.0)) * w6;
  gl_FragColor = c;
}
`;

/** The blurred silhouette laid on the table, in the shadow's colour. */
export const FRAG_COMPOSITE = /* glsl */ `
precision mediump float;
uniform sampler2D uTex;
uniform vec3 uColor;
uniform float uAlpha;
uniform vec2 uShift;
varying vec2 vUV;
void main() {
  float a = texture2D(uTex, vUV - uShift).a * uAlpha;
  gl_FragColor = vec4(uColor * a, a);
}
`;
