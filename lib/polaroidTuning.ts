"use client";

import { POLAROID_MOTION, SHADOW } from "./polaroid";
import { ratioFromDamping } from "./spring";

const ratio = (c: { stiffness: number; damping: number; mass: number }) =>
  ratioFromDamping(c.stiffness, c.damping, c.mass);

/**
 * Live tuning for the Polaroid.
 *
 * `POLAROID_MOTION` and `SHADOW` in `polaroid.ts` stay the authored truth;
 * this is a mutable, flattened copy the panel writes and the print's frame
 * loop reads, so the turn, the curl and the shadow can be moved while the
 * print is on screen. Nothing persists: the panel's copy button prints the
 * values shaped for `polaroid.ts`.
 */
export type PolaroidTune = {
  /** Which way a tap turns the print: 1 or -1. */
  flipDir: 1 | -1;
  topStiffness: number;
  topRatio: number;
  bottomStiffness: number;
  bottomRatio: number;
  lift: number;
  flexStiffness: number;
  flexRatio: number;
  flexKickTurn: number;
  flexKickLand: number;
  /** The resting curl at the bottom-right corner, front side up, radians. */
  curl: number;
  /** How far in from the corner the fold sits, card widths. */
  curlLength: number;
  /** Extra curl through the middle of a turn, gone again at either end. */
  curlThrough: number;
  /** Arrival: scale from, and its spring; the fade's spring; the curl at
   *  arrival as a multiple of rest, and its spring. */
  entryDelay: number;
  entryFromScale: number;
  entryScaleStiffness: number;
  entryScaleRatio: number;
  entryFadeStiffness: number;
  entryFromCurl: number;
  entryCurlKick: number;
  entryCurlStiffness: number;
  entryCurlRatio: number;
  /** Hover: how far the print tilts, and whether toward the pointer (1)
   *  or away from it (-1). */
  tiltMax: number;
  tiltToward: 1 | -1;
  /** Multipliers on the authored shadow: throw per height, softness, alpha. */
  shadowThrow: number;
  shadowSoft: number;
  shadowAlpha: number;
};

const authored = (): PolaroidTune => ({
  flipDir: POLAROID_MOTION.flipDir,
  topStiffness: POLAROID_MOTION.top.stiffness,
  topRatio: ratio(POLAROID_MOTION.top),
  bottomStiffness: POLAROID_MOTION.bottom.stiffness,
  bottomRatio: ratio(POLAROID_MOTION.bottom),
  lift: POLAROID_MOTION.lift,
  flexStiffness: POLAROID_MOTION.flex.stiffness,
  flexRatio: ratio(POLAROID_MOTION.flex),
  flexKickTurn: POLAROID_MOTION.flexKick.turn,
  flexKickLand: POLAROID_MOTION.flexKick.land,
  curl: POLAROID_MOTION.curl,
  curlLength: POLAROID_MOTION.curlLength,
  curlThrough: POLAROID_MOTION.curlThrough,
  entryDelay: POLAROID_MOTION.entry.delay,
  entryFromScale: POLAROID_MOTION.entry.fromScale,
  entryScaleStiffness: POLAROID_MOTION.entry.scale.stiffness,
  entryScaleRatio: ratio(POLAROID_MOTION.entry.scale),
  entryFadeStiffness: POLAROID_MOTION.entry.fade.stiffness,
  entryFromCurl: POLAROID_MOTION.entry.fromCurl,
  entryCurlKick: POLAROID_MOTION.entry.curlKick,
  entryCurlStiffness: POLAROID_MOTION.entry.curl.stiffness,
  entryCurlRatio: ratio(POLAROID_MOTION.entry.curl),
  tiltMax: POLAROID_MOTION.tiltMax,
  tiltToward: POLAROID_MOTION.tiltToward,
  shadowThrow: SHADOW.throw,
  shadowSoft: SHADOW.soft,
  shadowAlpha: SHADOW.alpha,
});

export const polaroidTune: PolaroidTune = authored();

type Listener = () => void;
const listeners = new Set<Listener>();
const flippers = new Set<Listener>();
const replayers = new Set<Listener>();

export function setPolaroidTune(patch: Partial<PolaroidTune>) {
  Object.assign(polaroidTune, patch);
  listeners.forEach((l) => l());
}
export function resetPolaroidTune() {
  Object.assign(polaroidTune, authored());
  listeners.forEach((l) => l());
}
export function subscribePolaroidTune(l: Listener) {
  listeners.add(l);
  return () => void listeners.delete(l);
}
/** The print listens; the panel asks for a turn. */
export function onPolaroidFlip(l: Listener) {
  flippers.add(l);
  return () => void flippers.delete(l);
}
export function flipPolaroid() {
  flippers.forEach((l) => l());
}
/** The print listens; the panel asks for the arrival again. */
export function onPolaroidReplay(l: Listener) {
  replayers.add(l);
  return () => void replayers.delete(l);
}
export function replayPolaroid() {
  replayers.forEach((l) => l());
}

/** Only what has moved, one line each, for pasting into a message. */
export function polaroidTuneChanges(): string {
  const base = authored();
  const lines: string[] = [];
  for (const key of Object.keys(base) as (keyof PolaroidTune)[]) {
    if (base[key] !== polaroidTune[key])
      lines.push(`${key}: ${JSON.stringify(base[key])} → ${JSON.stringify(polaroidTune[key])}`);
  }
  return lines.join("\n");
}

/** The current values, shaped for polaroid.ts. */
export function polaroidTuneSource(): string {
  const t = polaroidTune;
  const f = (n: number) => (Math.round(n * 1000) / 1000).toString();
  return `// POLAROID_MOTION
  flipDir: ${t.flipDir},
  top: springConfig(${f(t.topStiffness)}, ${f(t.topRatio)}),
  bottom: springConfig(${f(t.bottomStiffness)}, ${f(t.bottomRatio)}),
  lift: ${f(t.lift)},
  flex: springConfig(${f(t.flexStiffness)}, ${f(t.flexRatio)}),
  flexKick: { turn: ${f(t.flexKickTurn)}, land: ${f(t.flexKickLand)} },
  curl: ${f(t.curl)},
  curlLength: ${f(t.curlLength)},
  curlThrough: ${f(t.curlThrough)},
  entry: {
    delay: ${f(t.entryDelay)},
    scale: springConfig(${f(t.entryScaleStiffness)}, ${f(t.entryScaleRatio)}),
    fade: springConfig(${f(t.entryFadeStiffness)}, 1),
    curl: springConfig(${f(t.entryCurlStiffness)}, ${f(t.entryCurlRatio)}),
    fromScale: ${f(t.entryFromScale)},
    fromCurl: ${f(t.entryFromCurl)},
    curlKick: ${f(t.entryCurlKick)},
  },
  tiltMax: ${f(t.tiltMax)},
  tiltToward: ${t.tiltToward},

// SHADOW
  throw: ${f(t.shadowThrow)},
  soft: ${f(t.shadowSoft)},
  alpha: ${f(t.shadowAlpha)},`;
}
