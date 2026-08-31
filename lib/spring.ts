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
  /** Damping COEFFICIENT, which is what the integrator below actually wants. */
  damping: number;
  mass: number;
};

/**
 * Springs in this project are authored as stiffness + damping RATIO, not as a
 * raw damping coefficient.
 *
 * The ratio is the number with physical meaning: it says how the spring
 * behaves regardless of how stiff it is. Below 1 it overshoots and rings, at 1
 * it is critically damped — the fastest approach with no overshoot — and above
 * it the spring is sluggish. A coefficient means none of that on its own,
 * because the same number is bouncy on a soft spring and dead on a stiff one.
 * Retuning stiffness with a fixed ratio keeps the character and changes only
 * the speed, which is what makes these adjustable by feel.
 *
 *   c = 2 * zeta * sqrt(k * m)
 */
export function dampingFromRatio(
  stiffness: number,
  ratio: number,
  mass = 1,
): number {
  return 2 * ratio * Math.sqrt(stiffness * mass);
}

/** Author a spring as stiffness + damping ratio. The house form. */
export function springConfig(
  stiffness: number,
  ratio: number,
  mass = 1,
): SpringConfig {
  return { stiffness, damping: dampingFromRatio(stiffness, ratio, mass), mass };
}

/** Recover the ratio from a coefficient, for reading legacy values. */
export function ratioFromDamping(
  stiffness: number,
  damping: number,
  mass = 1,
): number {
  return damping / (2 * Math.sqrt(stiffness * mass));
}

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

/**
 * Follow a target exactly, while keeping track of how fast it is moving.
 *
 * For values driven straight off an authored path rather than by physics. It
 * differs from `snapSpring` in the one way that matters at a handover: the
 * spring comes away carrying the speed the path had. Snapping zeroes the
 * velocity, so the instant a spring takes back over it starts from a standstill
 * and the motion visibly stalls — at the end of a shuffle, right as the card is
 * tucking in.
 */
export function trackSpring(s: Spring, target: number, dt: number): void {
  s.velocity = dt > 0 ? (target - s.value) / dt : 0;
  s.value = target;
}

/** Seed a spring's momentum — how a fling hands its speed to the physics. */
export function kickSpring(s: Spring, velocity: number): void {
  s.velocity = velocity;
}

export function isAtRest(s: Spring, target: number): boolean {
  return s.value === target && s.velocity === 0;
}

/**
 * A cubic-bezier easing, the same shape a CSS `cubic-bezier()` describes.
 *
 * Springs cannot express "take exactly this long": their duration falls out of
 * the physics. Where a leg of a motion has to be a stated length of time — and
 * to still be moving when it ends, rather than settling early and waiting —
 * it has to be a curve against a clock instead.
 *
 * The curve gives y for a given x, and x is not the parameter it is defined
 * against, so this solves for the parameter first. Newton converges in a few
 * steps over this range.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const xAt = (t: number) => ((ax * t + bx) * t + cx) * t;
  const yAt = (t: number) => ((ay * t + by) * t + cy) * t;
  const dxAt = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

  return (x: number): number => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = xAt(t) - x;
      if (Math.abs(err) < 1e-5) break;
      const slope = dxAt(t);
      if (Math.abs(slope) < 1e-6) break;
      t -= err / slope;
    }
    return yAt(t);
  };
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
