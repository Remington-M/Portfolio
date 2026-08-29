/**
 * A tiny spring integrator.
 *
 * Motion's own springs are excellent, but the media layer needs springs it can
 * switch off per-frame: the deck is a scroll *scrubber* and must track the
 * pointer exactly, while the handoff into a project page wants physics. One
 * integrator that can be snapped or stepped keeps both on the same value.
 */
export type Spring = { value: number; velocity: number };

export function spring(value = 0): Spring {
  return { value, velocity: 0 };
}

export type SpringConfig = {
  stiffness: number;
  damping: number;
  mass: number;
};

/** Substep so a long frame can't make the integration explode. */
const MAX_STEP = 1 / 120;

export function stepSpring(
  s: Spring,
  target: number,
  dt: number,
  { stiffness, damping, mass }: SpringConfig,
): void {
  let remaining = Math.min(dt, 0.064);
  while (remaining > 0) {
    const h = Math.min(remaining, MAX_STEP);
    const force = -stiffness * (s.value - target);
    const drag = -damping * s.velocity;
    s.velocity += ((force + drag) / mass) * h;
    s.value += s.velocity * h;
    remaining -= h;
  }
  // Settle, so we stop writing styles once the spring is visually at rest.
  if (Math.abs(s.value - target) < 0.01 && Math.abs(s.velocity) < 0.05) {
    s.value = target;
    s.velocity = 0;
  }
}

/** Jump straight to a value, killing momentum. Used while scrubbing. */
export function snapSpring(s: Spring, target: number): void {
  s.value = target;
  s.velocity = 0;
}

export function isAtRest(s: Spring, target: number): boolean {
  return s.value === target && s.velocity === 0;
}

/* ------------------------------------------------------------------ *
 * Scalar helpers used across the geometry math
 * ------------------------------------------------------------------ */
export const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Hermite smoothstep — the prototype's `t * t * (3 - 2 * t)`. */
export const smoothstep = (t: number) => t * t * (3 - 2 * t);

export const clamp01 = (v: number) => clamp(v, 0, 1);
