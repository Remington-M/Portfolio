"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";
import { HERO_GRADIENT } from "@/lib/design";

/**
 * The word "motion" in the hero, and the spiral that runs through it on
 * hover.
 *
 * A CSS gradient cannot spiral: conic gives angle, radial gives radius, and
 * a spiral is a phase that depends on both. So the swirl is painted per
 * pixel on a small canvas laid exactly over the word, using the letterforms
 * as its clip. The DOM text stays — it is what is read and selected — and
 * on hover it fades to transparent while the canvas fades in over it.
 *
 * The field is a logarithmic spiral, `phase = arms * theta + wind * ln(r)`,
 * which is what tightens as it approaches the centre. Two of them at
 * different pitches and speeds are summed, so there is a slow broad turn
 * with a finer one riding on it. Colour is three stops crossfaded on that
 * phase, with a lookup table built once so the frame loop is a sum, a
 * sine and a table read per pixel.
 *
 * Everything the eye tunes lives in HERO_GRADIENT.
 */
export default function HeroWord({ children }: { children: string }) {
  const span = useRef<HTMLSpanElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion() ?? false;

  useEffect(() => {
    const el = span.current;
    const cv = canvas.current;
    if (!el || !cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    const G = HERO_GRADIENT;
    const lut = buildLut(G.stops);

    /* Per-pixel geometry, rebuilt on resize and never per frame. */
    let w = 0, h = 0, dpr = 1;
    let theta = new Float32Array(0);
    let lnr = new Float32Array(0);
    let img: ImageData | null = null;

    const layout = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = el.getBoundingClientRect();
      w = Math.max(1, Math.round(r.width * dpr));
      h = Math.max(1, Math.round(r.height * dpr));
      cv.width = w;
      cv.height = h;
      cv.style.width = `${r.width}px`;
      cv.style.height = `${r.height}px`;

      /* The clip: the same word in the same face at the same size, set on
       * the same baseline. CSS centres the font's content area in the line
       * box, so the baseline is that offset plus the ascent. */
      const cs = getComputedStyle(el);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      if ("letterSpacing" in ctx) (ctx as { letterSpacing: string }).letterSpacing = cs.letterSpacing;
      const m = ctx.measureText(children);
      const asc = m.fontBoundingBoxAscent ?? parseFloat(cs.fontSize) * 0.8;
      const desc = m.fontBoundingBoxDescent ?? parseFloat(cs.fontSize) * 0.2;
      const baseline = (r.height - (asc + desc)) / 2 + asc;
      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "left";
      ctx.fillStyle = "#fff";
      ctx.clearRect(0, 0, r.width, r.height);
      ctx.fillText(children, 0, baseline);
      const mask = ctx.getImageData(0, 0, w, h);

      /* Polar coordinates about the centre, once. The centre sits below the
       * word, so the arms converge toward a point the letters never contain
       * and no pixel ever shows the eye of the spiral. */
      theta = new Float32Array(w * h);
      lnr = new Float32Array(w * h);
      const cx = w * G.centre.x;
      const cy = h * G.centre.y;
      const scale = 1 / (parseFloat(cs.fontSize) * dpr);
      for (let y = 0, i = 0; y < h; y++) {
        for (let x = 0; x < w; x++, i++) {
          const dx = (x - cx) * scale;
          const dy = (y - cy) * scale;
          theta[i] = Math.atan2(dy, dx);
          lnr[i] = Math.log(Math.hypot(dx, dy) + G.eye);
        }
      }
      img = ctx.createImageData(w, h);
      /* Alpha channel carries the clip. */
      const d = img.data;
      for (let i = 3; i < d.length; i += 4) d[i] = mask.data[i];
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    };

    const TAU = Math.PI * 2;
    const draw = (t: number) => {
      if (!img) return;
      const d = img.data;
      const s = t / 1000;
      const a1 = G.coarse.arms, k1 = G.coarse.wind, v1 = (TAU * s) / G.coarse.period;
      const a2 = G.fine.arms, k2 = G.fine.wind, v2 = (TAU * s) / G.fine.period;
      const mix = G.fine.weight;
      for (let i = 0, p = 0; i < theta.length; i++, p += 4) {
        if (d[p + 3] === 0) continue;
        const ph =
          a1 * theta[i] + k1 * lnr[i] - v1 +
          mix * Math.sin(a2 * theta[i] + k2 * lnr[i] + v2);
        /* Phase to LUT index: one full turn of phase is one lap of the stops. */
        let u = (ph / TAU) % 1;
        if (u < 0) u += 1;
        const j = (u * 255) | 0;
        d[p] = lut[j * 3];
        d[p + 1] = lut[j * 3 + 1];
        d[p + 2] = lut[j * 3 + 2];
      }
      ctx.putImageData(img, 0, 0);
    };

    let raf = 0;
    const loop = (t: number) => {
      draw(t);
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      cancelAnimationFrame(raf);
      if (reduced) draw(0);
      else raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      /* Keep painting through the fade-out so the last frame is not frozen
       * while it is still visible. */
      setTimeout(() => cancelAnimationFrame(raf), G.fadeOut);
    };

    layout();
    draw(0);
    const ro = new ResizeObserver(() => { layout(); draw(0); });
    ro.observe(el);
    document.fonts?.ready.then(() => { layout(); draw(0); });
    el.addEventListener("pointerenter", start);
    el.addEventListener("pointerleave", stop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener("pointerenter", start);
      el.removeEventListener("pointerleave", stop);
    };
  }, [children, reduced]);

  return (
    <span
      ref={span}
      className="hero-motion"
      style={{
        "--fade-in": `${HERO_GRADIENT.fadeIn}ms`,
        "--fade-out": `${HERO_GRADIENT.fadeOut}ms`,
      } as React.CSSProperties}
    >
      {children}
      <canvas ref={canvas} aria-hidden />
    </span>
  );
}

/**
 * 256 colours around the loop of stops, mixed in linear light so the
 * midpoints do not go grey. Returned flat: r, g, b per entry.
 */
function buildLut(stops: readonly string[]): Uint8ClampedArray {
  const lin = stops.map(hexToLinear);
  const out = new Uint8ClampedArray(256 * 3);
  const n = lin.length;
  for (let j = 0; j < 256; j++) {
    const u = (j / 256) * n;
    const a = Math.floor(u) % n;
    const b = (a + 1) % n;
    /* Smoothstep between stops: each colour holds for a moment at its peak
     * rather than being a knife edge between two neighbours. */
    let f = u - Math.floor(u);
    f = f * f * (3 - 2 * f);
    for (let c = 0; c < 3; c++) {
      const v = lin[a][c] + (lin[b][c] - lin[a][c]) * f;
      out[j * 3 + c] = Math.round(linearToSrgb(v) * 255);
    }
  }
  return out;
}

function hexToLinear(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const s = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return [s((n >> 16) & 255), s((n >> 8) & 255), s(n & 255)];
}

function linearToSrgb(v: number): number {
  return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}
