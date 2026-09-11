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
  thickness: 1.2 / 88,
  /** How far inside the outline the edge strip sits, in card widths. */
  wallInset: 0.2 / 88,
  /** Distance from the camera to the table, in card widths. */
  camera: 3.6,
  /** Room the canvas keeps around the card for the swing, as multiples. */
  margin: { x: 1.9, y: 1.7 },
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
  /** The leading edge. Quick, with a little overshoot. */
  top: springConfig(70, 0.62),
  /** The trailing edge. Softer, so it lags and rings a little longer. */
  bottom: springConfig(48, 0.55),
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
  flex: springConfig(70, 0.32),
  flexKick: { turn: -2.2, land: 1.6 },
  /** Pointer tilt on hover, in radians at the edge of the card. */
  tilt: springConfig(120, 0.9),
  tiltMax: 0.09,
  /** Arrival: dropped onto the table from above the frame, a little large. */
  entry: {
    y: springConfig(64, 0.78),
    scale: springConfig(90, 0.8),
    roll: springConfig(70, 0.7),
    fromY: 1.35,
    fromScale: 1.14,
    fromRoll: -0.14,
  },
  /** Reduced motion: one critically damped spring, no twist, no flex. */
  reduced: springConfig(160, 1),
} as const;

/* ------------------------------------------------------------------ *
 * Development
 *
 * Seconds from the print landing to the picture being finished, and when it
 * starts. Real film takes ten to fifteen minutes to settle; the shader runs
 * the same sequence in eight seconds.
 * ------------------------------------------------------------------ */
export const DEVELOP = {
  delay: 0.55,
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

varying vec2 vUV;
varying vec3 vNormal;
varying vec3 vPos;

vec3 surf(vec2 uv) {
  vec2 p = (uv - 0.5) * uCard;
  // Curvature about each axis, centred so bending never lifts the middle.
  float z = uBendX * (p.x * p.x - uCard.x * uCard.x / 12.0)
          + uBendY * (p.y * p.y - uCard.y * uCard.y / 12.0);
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
  q = q * uScale * (1.0 + uShadow * 0.04) + uPos + uShadow * uShadowOffset;
  return q;
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
uniform float uShadowAlpha;
uniform float uShadowSoft;
uniform vec3 uShadowColor;
uniform vec3 uPaper;
uniform vec3 uCamPos;

varying vec2 vUV;
varying vec3 vNormal;
varying vec3 vPos;

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
  float blot = fbm(st * 3.2);
  float blot2 = fbm(st * 7.0 + 5.0);
  // Reagent spreads up from the pod, unevenly.
  float delay = st.y * 0.13 + blot * 0.17 + blot2 * 0.05;
  float local = clamp((t - delay) / 0.68, 0.0, 1.0);

  float aC = smoothstep(0.04, 0.72, local);
  float aM = smoothstep(0.17, 0.86, local);
  float aY = smoothstep(0.30, 1.00, local);
  vec3 dye = vec3(pow(target.r, aC), pow(target.g, aM), pow(target.b, aY));

  // The muddy middle: low contrast, a little desaturated, warm-grey haze.
  float mid = 1.0 - local;
  float lum = dot(dye, vec3(0.299, 0.587, 0.114));
  dye = mix(dye, vec3(lum), mid * 0.35);
  dye = mix(dye, vec3(0.64, 0.60, 0.54), mid * 0.22);
  // Uneven density that evens out as it finishes.
  dye *= 1.0 - (blot - 0.5) * 0.25 * mid;

  // The opacifier.
  vec3 veil = vec3(0.045, 0.072, 0.082) * (0.85 + blot * 0.4);
  float clear = smoothstep(0.0, 0.62, local);
  vec3 c = mix(veil, dye, clear);

  // Grain, heavier while the image is coming up; a colour mottle that fades.
  float g = hash(floor(st * 820.0)) - 0.5;
  c += g * (0.012 + 0.05 * mid);
  float mottle = (fbm(st * 9.0 + 2.0) - 0.5) * 0.07 * mid;
  c += vec3(mottle, 0.0, -mottle);
  return c;
}

void main() {
  vec2 p = (vUV - 0.5) * uCard;
  float d = roundedBox(p, uCard * 0.5, uRadius);

  if (uShadow > 0.5) {
    float a = 1.0 - smoothstep(-uShadowSoft, 0.005, d);
    a *= uShadowAlpha;
    gl_FragColor = vec4(uShadowColor * a, a);
    return;
  }

  float edge = uWall > 0.5 ? 1.0 : 1.0 - smoothstep(-0.004, 0.0, d);
  if (edge <= 0.0) discard;

  vec3 n = normalize(vNormal);
  // The faces are drawn one side at a time; the edge strip has its own
  // outward normal and is seen from both sides.
  if (uWall < 0.5 && !gl_FrontFacing) n = -n;
  vec3 v = normalize(uCamPos - vPos);
  vec3 l = normalize(vec3(-0.45, 0.7, 0.9));
  vec3 h = normalize(l + v);
  float ndl = max(dot(n, l), 0.0);
  float ndh = max(dot(n, h), 0.0);
  float fresnel = pow(1.0 - max(dot(n, v), 0.0), 3.0);

  vec3 base;
  float shine;
  float gloss;
  if (uWall > 0.5) {
    // The cut edge of the white plastic sheet, a touch greyer than the face.
    base = uPaper * 0.9;
    shine = 0.08;
    gloss = 10.0;
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
    shine = 0.30;
    gloss = 56.0;
  } else {
    // Seen from behind, so the back reads the right way round.
    base = texture2D(uBack, vec2(1.0 - vUV.x, 1.0 - vUV.y)).rgb;
    shine = 0.06;
    gloss = 9.0;
  }

  vec3 c = base * (0.84 + 0.16 * ndl);
  c += vec3(1.0) * pow(ndh, gloss) * shine * (0.7 + 0.3 * ndl);
  c += vec3(1.0) * fresnel * shine * 0.25;

  gl_FragColor = vec4(c * edge, edge);
}
`;
