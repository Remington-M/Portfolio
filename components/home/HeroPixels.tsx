"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { useAnimationFrame } from "motion/react";
import { heroTune as T } from "@/lib/heroTuning";

/**
 * The sentence as pixels, for the ripple and the hover. See
 * HERO_TYPE.ripple and HERO_TYPE.hover.
 *
 * Lives inside the sentence's block, over the text. When asked, the words
 * are drawn onto an offscreen canvas at exactly their DOM positions — each
 * fragment's glyph box from a Range, so the typed word and the word spans
 * measure the same way — in the text's own colour, and the result is read
 * back as cells of `pixel` device pixels, keeping the ones with ink. At 1
 * that is the type itself, pixel for pixel; at rest the layer is
 * indistinguishable from the text under it.
 *
 * Each frame every cell is offset — carried by any live wave, pushed by
 * the pointer's field — and written into an image buffer at its new place,
 * so a hundred thousand cells cost a typed-array pass rather than a draw
 * call each. When nothing is live the text comes back and the layer goes.
 */
export type HeroPixelsHandle = {
  /** Start a wave from a point in the block's own coordinates, px. */
  ripple: (x: number, y: number) => void;
  /** The pointer is here (block coordinates), or has left. */
  hover: (x: number, y: number) => void;
  leave: () => void;
};

type Wave = { x: number; y: number; t0: number; scale: number };

const HeroPixels = forwardRef<
  HeroPixelsHandle,
  {
    host: React.RefObject<HTMLElement | null>;
    /** Every element to draw. Its glyph box is measured here. */
    fragments: () => { el: Element; text: string }[];
    /** Baseline offset from a fragment's glyph-box top, px. */
    baseline: () => number;
  }
>(function HeroPixels({ host, fragments, baseline }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  /* Cells: device-px position, colour, and two randoms in -1..1. */
  const cells = useRef<{
    n: number; x: Float32Array; y: Float32Array; rgba: Uint8ClampedArray; r1: Float32Array; r2: Float32Array;
    /** Particle state, CSS px: offset from seat and velocity. */
    ox: Float32Array; oy: Float32Array; vx: Float32Array; vy: Float32Array;
  }>({
    n: 0, x: new Float32Array(0), y: new Float32Array(0), rgba: new Uint8ClampedArray(0), r1: new Float32Array(0), r2: new Float32Array(0),
    ox: new Float32Array(0), oy: new Float32Array(0), vx: new Float32Array(0), vy: new Float32Array(0),
  });
  const waves = useRef<Wave[]>([]);
  const live = useRef(false);
  const size = useRef({ w: 0, h: 0, dpr: 1 });
  const buf = useRef<ImageData | null>(null);
  const hidden = useRef<HTMLElement[]>([]);
  /* The pointer: position, smoothed velocity (px/s), and when it last moved. */
  const pointer = useRef({ x: 0, y: 0, vx: 0, vy: 0, t: 0, on: false });
  const lastT = useRef(0);

  const glyphBox = (el: Element) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    return r.getBoundingClientRect();
  };

  const build = () => {
    const el = host.current, cv = canvas.current;
    if (!el || !cv) return false;
    const b = el.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = Math.ceil(b.width), h = Math.ceil(b.height);
    size.current = { w, h, dpr };
    cv.width = w * dpr;
    cv.height = h * dpr;
    cv.style.width = `${w}px`;
    cv.style.height = `${h}px`;

    const cs = getComputedStyle(el);
    const off = document.createElement("canvas");
    off.width = w * dpr;
    off.height = h * dpr;
    const o = off.getContext("2d", { willReadFrequently: true });
    if (!o) return false;
    o.setTransform(dpr, 0, 0, dpr, 0, 0);
    o.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    if ("letterSpacing" in o) (o as { letterSpacing: string }).letterSpacing = cs.letterSpacing;
    o.textBaseline = "alphabetic";
    o.fillStyle = cs.color;
    const base = baseline();
    hidden.current = [];
    for (const f of fragments()) {
      const r = glyphBox(f.el);
      o.fillText(f.text, r.left - b.left, r.top - b.top + base);
      if (f.el instanceof HTMLElement) hidden.current.push(f.el);
    }

    /* Read back as cells. */
    const step = Math.max(1, Math.round(T.ripplePixel));
    const W = off.width, H = off.height;
    const img = o.getImageData(0, 0, W, H).data;
    const cap = Math.ceil(W / step) * Math.ceil(H / step);
    const x = new Float32Array(cap), y = new Float32Array(cap);
    const r1 = new Float32Array(cap), r2 = new Float32Array(cap);
    const rgba = new Uint8ClampedArray(cap * 4);
    let n = 0;
    for (let yy = 0; yy < H; yy += step) {
      for (let xx = 0; xx < W; xx += step) {
        /* One sample per cell; at step 1 that is every pixel. */
        const i = (yy * W + xx) * 4;
        const a = img[i + 3];
        if (a < 8) continue;
        x[n] = xx; y[n] = yy;
        rgba[n * 4] = img[i]; rgba[n * 4 + 1] = img[i + 1]; rgba[n * 4 + 2] = img[i + 2]; rgba[n * 4 + 3] = a;
        const s1 = Math.sin(xx * 12.9898 + yy * 78.233) * 43758.5453;
        const s2 = Math.sin(xx * 39.346 + yy * 11.135) * 24634.6345;
        r1[n] = (s1 - Math.floor(s1)) * 2 - 1;
        r2[n] = (s2 - Math.floor(s2)) * 2 - 1;
        n++;
      }
    }
    cells.current = {
      n, x, y, rgba, r1, r2,
      ox: new Float32Array(n), oy: new Float32Array(n), vx: new Float32Array(n), vy: new Float32Array(n),
    };
    buf.current = new ImageData(W, H);
    return true;
  };

  const show = (on: boolean) => {
    const cv = canvas.current;
    if (cv) cv.style.opacity = on ? "1" : "0";
    for (const el of hidden.current) el.style.visibility = on ? "hidden" : "";
  };

  const wake = () => {
    if (live.current) return true;
    if (!build()) return false;
    live.current = true;
    lastT.current = 0;
    show(true);
    return true;
  };

  useImperativeHandle(ref, () => ({
    ripple: (x, y) => {
      if (!wake()) return;
      const now = performance.now();
      const count = Math.max(1, Math.round(T.ripplePulses));
      for (let i = 0; i < count; i++)
        waves.current.push({
          x, y,
          t0: now + i * T.ripplePulseGap * 1000,
          scale: Math.pow(T.ripplePulseDecay, i),
        });
    },
    hover: (x, y) => {
      if (!wake()) return;
      const p = pointer.current;
      const now = performance.now();
      if (p.on && p.t) {
        const dt = Math.max(0.004, (now - p.t) / 1000);
        /* Smoothed so a jittery hand does not read as bursts. */
        p.vx += ((x - p.x) / dt - p.vx) * 0.5;
        p.vy += ((y - p.y) / dt - p.vy) * 0.5;
      } else {
        p.vx = 0; p.vy = 0;
      }
      p.x = x; p.y = y; p.t = now; p.on = true;
    },
    leave: () => {
      pointer.current.on = false;
    },
  }));

  useAnimationFrame((now) => {
    if (!live.current) return;
    const cv = canvas.current;
    const ctx = cv?.getContext("2d");
    const img = buf.current;
    if (!cv || !ctx || !img) return;
    const { w, h, dpr } = size.current;
    const dt = lastT.current ? Math.min(0.04, (now - lastT.current) / 1000) : 0;
    lastT.current = now;

    /* The pointer counts as moving for a moment after its last event. */
    const p = pointer.current;
    const moving = p.on && now - p.t < 80;
    const speed = Math.min(T.hoverMaxSpeed, Math.hypot(p.vx, p.vy));
    const throwing = moving && speed > 1;
    const R = T.hoverRadius;
    const F = T.hoverForce * speed;
    const ux = throwing ? p.vx / (speed || 1) : 0, uy = throwing ? p.vy / (speed || 1) : 0;
    const outward = T.hoverOutward;
    const K = T.hoverStiffness;
    const Cd = T.hoverRatio * 2 * Math.sqrt(K);

    const c = T.rippleSpeed, lam = T.rippleWavelength, wd = T.rippleWidth;
    const A = T.rippleAmplitude, S = T.rippleScatter, dim = T.rippleDim;
    const reach = Math.hypot(w, h) * 1.5;
    waves.current = waves.current.filter((wv) => ((now - wv.t0) / 1000) * c < reach + wd * 3);
    const ws = waves.current
      .filter((wv) => now >= wv.t0)
      .map((wv) => ({ x: wv.x, y: wv.y, scale: wv.scale, front: ((now - wv.t0) / 1000) * c }));

    const C = cells.current;
    const d = img.data;
    d.fill(0);
    const W = img.width, H = img.height;
    let energy = 0;
    for (let i = 0; i < C.n; i++) {
      /* Physics in CSS px; the write in device px. */
      const cx = C.x[i] / dpr, cy = C.y[i] / dpr;

      /* The particle: thrown by the pointer, sprung home, damped. */
      let vx = C.vx[i], vy = C.vy[i], ox = C.ox[i], oy = C.oy[i];
      if (throwing) {
        const rx = cx + ox - p.x, ry = cy + oy - p.y;
        const dist = Math.hypot(rx, ry) || 1;
        if (dist < R * 2.5) {
          const env = Math.exp(-(dist * dist) / (R * R)) * F;
          const dx = ux * (1 - outward) + (rx / dist) * outward;
          const dy = uy * (1 - outward) + (ry / dist) * outward;
          vx += (dx + C.r1[i] * 0.25) * env * dt;
          vy += (dy + C.r2[i] * 0.25) * env * dt;
        }
      }
      if (dt > 0 && (vx !== 0 || vy !== 0 || ox !== 0 || oy !== 0)) {
        vx += (-K * ox - Cd * vx) * dt;
        vy += (-K * oy - Cd * vy) * dt;
        ox += vx * dt;
        oy += vy * dt;
        /* Snap the last of it, so the layer can go to sleep. */
        if (Math.abs(ox) < 0.02 && Math.abs(oy) < 0.02 && Math.abs(vx) < 0.5 && Math.abs(vy) < 0.5) {
          ox = 0; oy = 0; vx = 0; vy = 0;
        }
        C.vx[i] = vx; C.vy[i] = vy; C.ox[i] = ox; C.oy[i] = oy;
      }
      const e = ox * ox + oy * oy;
      if (e > energy) energy = e;

      /* The waves, on top. */
      let dx = ox, dy = oy, crest = 0;
      for (const wv of ws) {
        const rx = cx - wv.x, ry = cy - wv.y;
        const dist = Math.hypot(rx, ry) || 1;
        const u = wv.front - dist;
        if (u < -wd * 2 || u > wd * 2) continue;
        const env = Math.exp(-(u * u) / (wd * wd * 0.5)) * wv.scale;
        const sn = env * Math.sin((2 * Math.PI * u) / lam);
        const as = Math.abs(sn);
        dx += (rx / dist) * sn * A + C.r1[i] * S * env * as;
        dy += (ry / dist) * sn * A + C.r2[i] * S * env * as;
        if (as > crest) crest = as;
      }

      const X = Math.round(C.x[i] + dx * dpr), Y = Math.round(C.y[i] + dy * dpr);
      if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
      const o = (Y * W + X) * 4, q = i * 4;
      const a = C.rgba[q + 3] * (1 - dim * Math.min(1, crest));
      if (a <= d[o + 3]) continue;
      d[o] = C.rgba[q]; d[o + 1] = C.rgba[q + 1]; d[o + 2] = C.rgba[q + 2]; d[o + 3] = a;
    }
    ctx.putImageData(img, 0, 0);

    if (waves.current.length === 0 && !p.on && energy === 0) {
      live.current = false;
      show(false);
    }
  });

  useEffect(() => () => show(false), []);

  return (
    <canvas
      ref={canvas}
      aria-hidden
      style={{ position: "absolute", left: 0, top: 0, opacity: 0, pointerEvents: "none" }}
    />
  );
});

export default HeroPixels;
