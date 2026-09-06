"use client";

import { CASE, SPRING } from "./design";
import { cubicBezier, ratioFromDamping, springConfig, spring, stepSpring, type SpringConfig } from "./spring";

/**
 * Live tuning for the shot transition.
 *
 * The numbers in `design.ts` are the authored ones and stay the source of
 * truth — this is a mutable copy of the handful that have to be judged by eye,
 * so they can be moved while the thing is running instead of through an edit,
 * a rebuild and a reload. The panel writes here; the media layer reads here.
 *
 * Nothing persists. Tuning ends by copying the values back into `design.ts`,
 * which is what the panel's copy button is for — a session's worth of dragging
 * sliders is worth nothing if it cannot be committed.
 */
export type Tuning = {
  /**
   * The push, off or on, as one switch.
   *
   * Off, a shot change is nothing but the morph — the frame changes shape and
   * the picture cuts underneath it, which is what this page did before any of
   * this. There is no carry either: the nudge is momentum handed over BY the
   * arriving clip, so with nothing arriving there is nothing to hand.
   *
   * It exists to be flipped while watching. The push and the morph are two
   * answers to the same question and the only way to choose between them is to
   * see them back to back without a rebuild in between.
   */
  pushOn: boolean;
  /**
   * The viewer's shape: off, it takes each clip's proportions and morphs
   * between them; on, it is one fixed window and the clips are contained
   * inside it.
   *
   * The morph and the push are both answers to "something changed", and running
   * both at full strength puts a resize and a slide on the same instant. This
   * turns the resize off so the push can be judged alone.
   */
  frameFixed: boolean;
  /**
   * Hold the picture's size still while the viewer morphs around it.
   *
   * Off, each clip fills the viewer, so a frame growing from 302 to 914 wide
   * takes the picture with it — the container's resize and the picture's zoom
   * land on the same instant as the push slides it sideways, and three motions
   * at once is one too many to read.
   *
   * On, a clip is drawn at the size it will settle at and never changes. The
   * morph stops being a zoom and becomes a mask: the viewer opens and closes
   * over a picture that is holding still.
   */
  contentFixed: boolean;
  /**
   * Run the viewer's change of shape on the push's clock instead of its own
   * spring.
   *
   * They are one event described twice: the frame morphs on `SPRING.morph`
   * while the picture crosses on a curve, and two timebases for one moment can
   * only agree by luck. They do not — the spring leaves first, so the frame is
   * most of the way open while the clips have barely moved, and the gap between
   * them is the bare viewer showing through.
   *
   * On one clock the two cannot drift, and the coverage stops being something
   * to patch and becomes a property of the geometry. What it costs is the
   * spring's character on the morph; the carry still puts an overshoot on the
   * end of the whole gesture.
   */
  morphOnPush: boolean;
  /**
   * How much of the push the viewer's change of shape takes, 0–1.
   *
   * 1 is the two in lockstep. Below that the frame finishes early and the
   * picture keeps crossing under a viewer that has already arrived — still one
   * clock, but the shape leading the content rather than pacing it.
   *
   * It has a cost, and only in one direction. The two clips cover the frame
   * between them because they are exactly as far apart as the frame is wide;
   * let the frame finish GROWING first and it is wider than they have yet
   * spread, so bare viewer shows at the trailing edge until they catch up.
   * Shrinking is free — the frame gets small faster than the clips separate,
   * and they cover it the whole way.
   */
  morphSpan: number;
  /** How long the content takes to arrive, ms. */
  pushMs: number;
  /** Pause between the push landing and the arriving clip starting, ms. */
  playDelay: number;
  /** Push distance as a fraction of frame width, at each end of the assist. */
  pushMin: number;
  pushMax: number;
  /** Aspect distance at which the push has fallen to `pushMin`. */
  pushFalloff: number;
  /** The arrival curve. Its exit slope is the handoff velocity. */
  ease: [number, number, number, number];
  /** Fraction of the clip's landing speed the viewer takes on. */
  transfer: number;
  /** Ceiling on the viewer's excursion, px. */
  maxPx: number;
  /** The spring that brings the viewer back. */
  stiffness: number;
  ratio: number;
};

export const tuning: Tuning = {
  pushOn: true,
  frameFixed: false,
  contentFixed: true,
  morphOnPush: true,
  morphSpan: CASE.morphSpan,
  pushMs: CASE.pushMs,
  playDelay: CASE.playDelay,
  pushMin: CASE.push.min,
  pushMax: CASE.push.max,
  pushFalloff: CASE.pushFalloff,
  ease: [...CASE.carry.ease] as [number, number, number, number],
  transfer: CASE.carry.transfer,
  maxPx: CASE.carry.maxPx,
  stiffness: SPRING.carry.stiffness,
  ratio: ratioFromDamping(SPRING.carry.stiffness, SPRING.carry.damping),
};

/**
 * Values that fall out of the tunable ones and cost too much to recompute per
 * frame. Rebuilt whenever anything changes, which is only ever when a slider
 * moves — never during playback.
 */
export const derived = {
  ease: cubicBezier(...tuning.ease),
  /** How fast the curve is travelling when it lands, as a multiple of average. */
  exitSlope: 0,
  /** Peak excursion per unit of release velocity, for the carry spring. */
  carryRate: 1,
  spring: springConfig(tuning.stiffness, tuning.ratio) as SpringConfig,
};

function recompute() {
  derived.ease = cubicBezier(...tuning.ease);
  derived.exitSlope = (1 - derived.ease(1 - 1e-4)) / 1e-4;
  derived.spring = springConfig(tuning.stiffness, tuning.ratio);

  // Released at its own target with unit velocity: the peak it reaches is the
  // conversion between "how hard it was hit" and "how far it goes".
  const probe = spring(0);
  probe.velocity = 1;
  let peak = 0;
  for (let i = 0; i < 900; i++) {
    stepSpring(probe, 0, 1 / 120, derived.spring, 0);
    peak = Math.max(peak, Math.abs(probe.value));
  }
  derived.carryRate = peak > 0 ? 1 / peak : 1;
}
/* ------------------------------------------------------------------ *
 * Persistence
 *
 * Tuning by feel means dozens of small moves over a long sitting, and every
 * edit to a source file reloads the page. Losing the sliders on each one made
 * the panel useless for the thing it exists to do.
 *
 * Deliberately per-browser and not per-project: this is a scratchpad, not a
 * source of truth. `design.ts` remains the record, and the copy button is how
 * a session's work gets there.
 * ------------------------------------------------------------------ */
const STORE_KEY = "portfolio.tuning.v1";

function load() {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as Partial<Tuning>;
    // Only keys we still recognise, and only of the right shape — a stored
    // blob outlives the code that wrote it, and a renamed or retyped field
    // should be ignored rather than poison the whole set.
    for (const k of Object.keys(tuning) as (keyof Tuning)[]) {
      const v = saved[k];
      if (v === undefined) continue;
      if (k === "ease") {
        if (Array.isArray(v) && v.length === 4 && v.every((n) => typeof n === "number"))
          tuning.ease = [...v] as Tuning["ease"];
      } else if (typeof v === typeof tuning[k]) {
        (tuning as Record<string, unknown>)[k] = v;
      }
    }
  } catch {
    // Unreadable or unparseable storage is not worth failing over.
  }
}

function save() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(tuning));
  } catch {
    // Private browsing, quota, disabled storage — none of it matters here.
  }
}

load();
recompute();

const listeners = new Set<() => void>();

export function setTuning(patch: Partial<Tuning>) {
  Object.assign(tuning, patch);
  recompute();
  save();
  listeners.forEach((fn) => fn());
}

export function resetTuning() {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(STORE_KEY);
    } catch {
      // As above.
    }
  }
  setTuning({
    pushOn: true,
    frameFixed: false,
    contentFixed: true,
    morphOnPush: true,
    morphSpan: 1,
    pushMs: CASE.pushMs,
    playDelay: CASE.playDelay,
    pushMin: CASE.push.min,
    pushMax: CASE.push.max,
    pushFalloff: CASE.pushFalloff,
    ease: [...CASE.carry.ease] as [number, number, number, number],
    transfer: CASE.carry.transfer,
    maxPx: CASE.carry.maxPx,
    stiffness: SPRING.carry.stiffness,
    ratio: ratioFromDamping(SPRING.carry.stiffness, SPRING.carry.damping),
  });
}

export function subscribeTuning(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** The current values, shaped as the `design.ts` they would be pasted into. */
export function tuningSource(): string {
  const [a, b, c, d] = tuning.ease;
  return `${tuning.pushOn ? "" : "// PUSH IS SWITCHED OFF — these values are not in play\n"}// lib/design.ts — CASE
  pushMs: ${Math.round(tuning.pushMs)},
  playDelay: ${Math.round(tuning.playDelay)},
  pushFalloff: ${+tuning.pushFalloff.toFixed(3)},
  morphSpan: ${+tuning.morphSpan.toFixed(3)},
  push: {
    min: ${+tuning.pushMin.toFixed(3)},
    max: ${+tuning.pushMax.toFixed(3)},
  },
  carry: {
    ease: [${+a.toFixed(3)}, ${+b.toFixed(3)}, ${+c.toFixed(3)}, ${+d.toFixed(3)}] as const,
    transfer: ${+tuning.transfer.toFixed(3)},
    maxPx: ${Math.round(tuning.maxPx)},
  },

// lib/design.ts — SPRING
  carry: springConfig(${Math.round(tuning.stiffness)}, ${+tuning.ratio.toFixed(3)}),`;
}
