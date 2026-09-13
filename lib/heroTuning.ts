"use client";

import { HERO_TYPE } from "./design";

/**
 * Live tuning for the typed landing sequence.
 *
 * HERO_TYPE in `design.ts` stays the authored truth; this is a mutable,
 * flattened copy the panel writes and the sequence reads, so a value can
 * be moved and the sequence replayed without a rebuild. Nothing persists:
 * the panel's copy button prints the values shaped for `design.ts`.
 */
export type HeroTune = {
  lead: number;
  blink: number;
  blinkIn: number;
  perChar: number;
  hold: number;
  sweep: number;
  lineGap: number;
  smearThreshold: number;
  smearGain: number;
  smearRise: number;
  smearRelax: number;
  cursorWidth: number;
  cursorAbove: number;
  cursorBelow: number;
  cursorOffset: number;
  sweepMode: "ease" | "spring";
  sweepEase: [number, number, number, number];
  sweepStiffness: number;
  sweepRatio: number;
  sweepMass: number;
  wordTravel: number;
  wordDelay: number;
  wordStiffness: number;
  wordRatio: number;
  wordMass: number;
  wordFade: number;
  slideLead: number;
  slideStiffness: number;
  slideRatio: number;
  slideMass: number;
  blinkOut: number;
  fadeOut: number;
  holdIn: number;
  riseStiffness: number;
  riseRatio: number;
  riseMass: number;
  ripplePixel: number;
  rippleDelay: number;
  rippleOriginY: number;
  rippleSpeed: number;
  rippleWavelength: number;
  rippleWidth: number;
  rippleAmplitude: number;
  rippleScatter: number;
  rippleDim: number;
  ripplePulses: number;
  ripplePulseGap: number;
  ripplePulseDecay: number;
  hoverRadius: number;
  hoverForce: number;
  hoverOutward: number;
  hoverMaxSpeed: number;
  hoverStiffness: number;
  hoverRatio: number;
};

const authored = (): HeroTune => ({
  lead: HERO_TYPE.lead,
  blink: HERO_TYPE.blink,
  blinkIn: HERO_TYPE.blinkIn,
  perChar: HERO_TYPE.perChar,
  hold: HERO_TYPE.hold,
  sweep: HERO_TYPE.sweep,
  lineGap: HERO_TYPE.lineGap,
  smearThreshold: HERO_TYPE.smear.threshold,
  smearGain: HERO_TYPE.smear.gain,
  smearRise: HERO_TYPE.smear.rise,
  smearRelax: HERO_TYPE.smear.relax,
  cursorWidth: HERO_TYPE.cursor.width,
  cursorAbove: HERO_TYPE.cursor.above,
  cursorBelow: HERO_TYPE.cursor.below,
  cursorOffset: HERO_TYPE.cursor.offset,
  sweepMode: HERO_TYPE.sweepMode,
  sweepEase: [...HERO_TYPE.sweepEase] as [number, number, number, number],
  sweepStiffness: HERO_TYPE.sweepSpring.stiffness,
  sweepRatio: HERO_TYPE.sweepSpring.ratio,
  sweepMass: HERO_TYPE.sweepSpring.mass,
  wordTravel: HERO_TYPE.word.travel,
  wordDelay: HERO_TYPE.word.delay,
  wordStiffness: HERO_TYPE.word.stiffness,
  wordRatio: HERO_TYPE.word.ratio,
  wordMass: HERO_TYPE.word.mass,
  wordFade: HERO_TYPE.word.fade,
  slideLead: HERO_TYPE.slide.lead,
  slideStiffness: HERO_TYPE.slide.stiffness,
  slideRatio: HERO_TYPE.slide.ratio,
  slideMass: HERO_TYPE.slide.mass,
  blinkOut: HERO_TYPE.blinkOut,
  fadeOut: HERO_TYPE.fadeOut,
  holdIn: HERO_TYPE.holdIn,
  riseStiffness: HERO_TYPE.rise.stiffness,
  riseRatio: HERO_TYPE.rise.ratio,
  riseMass: HERO_TYPE.rise.mass,
  ripplePixel: HERO_TYPE.ripple.pixel,
  rippleDelay: HERO_TYPE.ripple.delay,
  rippleOriginY: HERO_TYPE.ripple.origin.y,
  rippleSpeed: HERO_TYPE.ripple.speed,
  rippleWavelength: HERO_TYPE.ripple.wavelength,
  rippleWidth: HERO_TYPE.ripple.width,
  rippleAmplitude: HERO_TYPE.ripple.amplitude,
  rippleScatter: HERO_TYPE.ripple.scatter,
  rippleDim: HERO_TYPE.ripple.dim,
  ripplePulses: HERO_TYPE.ripple.pulses,
  ripplePulseGap: HERO_TYPE.ripple.pulseGap,
  ripplePulseDecay: HERO_TYPE.ripple.pulseDecay,
  hoverRadius: HERO_TYPE.hover.radius,
  hoverForce: HERO_TYPE.hover.force,
  hoverOutward: HERO_TYPE.hover.outward,
  hoverMaxSpeed: HERO_TYPE.hover.maxSpeed,
  hoverStiffness: HERO_TYPE.hover.stiffness,
  hoverRatio: HERO_TYPE.hover.ratio,
});

export const heroTune: HeroTune = authored();

type Listener = () => void;
const listeners = new Set<Listener>();
const replayers = new Set<Listener>();

export function setHeroTune(patch: Partial<HeroTune>) {
  Object.assign(heroTune, patch);
  listeners.forEach((l) => l());
}
export function resetHeroTune() {
  Object.assign(heroTune, authored());
  listeners.forEach((l) => l());
}
export function subscribeHeroTune(l: Listener) {
  listeners.add(l);
  return () => void listeners.delete(l);
}
/** Home listens; the panel asks. */
export function onHeroReplay(l: Listener) {
  replayers.add(l);
  return () => void replayers.delete(l);
}
export function replayHero() {
  replayers.forEach((l) => l());
}

/**
 * A spring for motion's `animate`, from stiffness, damping ratio and mass.
 * Damping ratio is the half that carries the feel: 1 is critically damped,
 * below it overshoots and rings, above it drags.
 */
export function heroSpring(stiffness: number, ratio: number, mass: number) {
  return {
    type: "spring" as const,
    stiffness,
    damping: ratio * 2 * Math.sqrt(stiffness * mass),
    mass,
  };
}

/** The current values, shaped as the HERO_TYPE block in design.ts. */
export function heroTuneSource(): string {
  const t = heroTune;
  const f = (n: number) => (Math.round(n * 1000) / 1000).toString();
  return `export const HERO_TYPE = {
  lead: ${f(t.lead)},
  blink: ${f(t.blink)},
  blinkIn: ${f(t.blinkIn)},
  perChar: ${f(t.perChar)},
  hold: ${f(t.hold)},
  sweep: ${f(t.sweep)},
  lineGap: ${f(t.lineGap)},
  smear: { threshold: ${f(t.smearThreshold)}, gain: ${f(t.smearGain)}, rise: ${f(t.smearRise)}, relax: ${f(t.smearRelax)} },
  cursor: { width: ${f(t.cursorWidth)}, above: ${f(t.cursorAbove)}, below: ${f(t.cursorBelow)}, offset: ${f(t.cursorOffset)} },
  sweepMode: "${t.sweepMode}" as "ease" | "spring",
  sweepEase: [${t.sweepEase.map(f).join(", ")}] as [number, number, number, number],
  sweepSpring: { stiffness: ${f(t.sweepStiffness)}, ratio: ${f(t.sweepRatio)}, mass: ${f(t.sweepMass)} },
  word: {
    travel: ${f(t.wordTravel)},
    delay: ${f(t.wordDelay)},
    stiffness: ${f(t.wordStiffness)},
    ratio: ${f(t.wordRatio)},
    mass: ${f(t.wordMass)},
    fade: ${f(t.wordFade)},
  },
  slide: { lead: ${f(t.slideLead)}, stiffness: ${f(t.slideStiffness)}, ratio: ${f(t.slideRatio)}, mass: ${f(t.slideMass)} },
  blinkOut: ${f(t.blinkOut)},
  fadeOut: ${f(t.fadeOut)},
  holdIn: ${f(t.holdIn)},
  rise: { stiffness: ${f(t.riseStiffness)}, ratio: ${f(t.riseRatio)}, mass: ${f(t.riseMass)} },
  ripple: {
    pixel: ${f(t.ripplePixel)},
    delay: ${f(t.rippleDelay)},
    origin: { x: 0.5, y: ${f(t.rippleOriginY)} },
    speed: ${f(t.rippleSpeed)},
    wavelength: ${f(t.rippleWavelength)},
    width: ${f(t.rippleWidth)},
    amplitude: ${f(t.rippleAmplitude)},
    scatter: ${f(t.rippleScatter)},
    dim: ${f(t.rippleDim)},
    pulses: ${Math.round(t.ripplePulses)},
    pulseGap: ${f(t.ripplePulseGap)},
    pulseDecay: ${f(t.ripplePulseDecay)},
  },
  hover: {
    radius: ${f(t.hoverRadius)},
    force: ${f(t.hoverForce)},
    outward: ${f(t.hoverOutward)},
    maxSpeed: ${f(t.hoverMaxSpeed)},
    stiffness: ${f(t.hoverStiffness)},
    ratio: ${f(t.hoverRatio)},
  },
} as const;`;
}
