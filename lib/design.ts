/**
 * Design tokens, transcribed from the handoff.
 *
 * Numbers here are authored values from the prototypes — treat this file as the
 * single source of truth and change geometry here rather than in components.
 */

/* ------------------------------------------------------------------ *
 * The card ratio rule
 *
 * Every card and device screen is locked to the iPhone aspect ratio.
 * Reference device is 402x874. Corner radius is proportional to the same
 * reference: 55/402. Resize a card by picking ONE dimension and deriving
 * the rest — aspect drift distorts real screen recordings.
 * ------------------------------------------------------------------ */
export const CARD_RATIO = 402 / 874; // 0.4599 — width / height
export const RADIUS_RATIO = 55 / 402; // 0.1368 — radius / width

/** Derive a full card box from a height, preserving both locked ratios. */
export function cardFromHeight(height: number) {
  const width = height * CARD_RATIO;
  return { width, height, radius: width * RADIUS_RATIO };
}

/** Derive a full card box from a width, preserving both locked ratios. */
export function cardFromWidth(width: number) {
  return { width, height: width / CARD_RATIO, radius: width * RADIUS_RATIO };
}

/* ------------------------------------------------------------------ *
 * Easing and duration
 * ------------------------------------------------------------------ */

/** The house curve. Every position, size and transform transition uses it. */
export const HOUSE = [0.2, 0.85, 0.15, 1] as const;
export const HOUSE_CSS = "cubic-bezier(.2,.85,.15,1)";

export const DUR = {
  /** Opacity under scroll. */
  scrub: 0.2,
  /** Deck exit, nav crossfade. */
  exit: 0.46,
  nav: 0.35,
  /** Card grow / rise. */
  grow: 0.55,
  /** Desktop device morph. */
  morph: 0.82,
} as const;

/**
 * Springs for the discrete interactions. The scroll-driven motion is a direct
 * mapping and deliberately uses no spring — it has to scrub backwards exactly.
 */
export const SPRING = {
  /** Card flying from deck to device frame. Settles without overshoot. */
  handoff: { type: "spring", stiffness: 220, damping: 30, mass: 1 },
  /** Deck cards dropping away on exit. A little life at the end. */
  drop: { type: "spring", stiffness: 260, damping: 26, mass: 0.9 },
  /** Soft UI moves — ticks, labels. */
  ui: { type: "spring", stiffness: 400, damping: 40, mass: 0.6 },
} as const;

/* ------------------------------------------------------------------ *
 * Shadows
 * ------------------------------------------------------------------ */
export const SHADOW = {
  cardRest:
    "0 20px 40px -22px oklch(0.35 0.02 60 / 0.4), inset 0 0 0 1px oklch(0.18 0.006 60 / 0.09)",
  cardFront:
    "0 28px 56px -28px oklch(0.35 0.02 60 / 0.45), inset 0 0 0 1px oklch(0.18 0.006 60 / 0.1)",
  cardBack:
    "0 16px 40px -26px oklch(0.35 0.02 60 / 0.38), inset 0 0 0 1px oklch(0.18 0.006 60 / 0.08)",
  device: "0 36px 70px -34px oklch(0.35 0.02 60 / 0.5)",
  carousel:
    "0 24px 48px -24px oklch(0.35 0.02 60 / 0.42), inset 0 0 0 1px oklch(0.18 0.006 60 / 0.09)",
  ghost: "0 30px 60px -34px oklch(0.35 0.02 60 / 0.45)",
} as const;

/* ------------------------------------------------------------------ *
 * Home deck geometry
 *
 * The prototype authors these against a fixed 1440x900 / 390x844 stage. We keep
 * the authored numbers as a reference frame and express placement as fractions
 * of it, so the stage can be any viewport size without re-authoring. Card size
 * comes from viewport height through the ratio rule above.
 * ------------------------------------------------------------------ */
export const DESKTOP_REF = { w: 1440, h: 900 } as const;
export const MOBILE_REF = { w: 390, h: 844 } as const;

export const DECK = {
  desktop: {
    /** Scroll distance for the hero-to-deck intro, and per project after that. */
    intro: 440,
    step: 440,
    /** Authored card is 322x700 at the 1440x900 reference. */
    cardHeight: 700,
    cardHeightMin: 470,
    /** Deck origin travels as the hero leaves: 720 -> 985 x, 770 -> 495 y. */
    cx: [720 / 1440, 985 / 1440] as const,
    cy: [770 / 900, 495 / 900] as const,
    /** Depth-stack offsets per card behind the front one. */
    dx: 9,
    dy: -15,
    dScale: 0.028,
    dOpacity: 0.11,
    /** Seeded jitter amplitudes: x px, y px, rotation deg. */
    jitter: [30, 16, 7] as const,
    /** The signature shuffle: out to the right, rotating in Y, then to the back. */
    arcX: 198,
    arcY: -40,
    arcRot: 7,
    arcRotY: -18,
    perspective: 1600,
  },
  mobile: {
    intro: 300,
    step: 300,
    /** Authored card is 252x548 at the 390x844 reference. */
    cardHeight: 548,
    cardHeightMin: 420,
    cx: [0.5, 0.5] as const,
    /** Deck starts low and rises to top:118 as the hero clears. */
    cyPx: { top: 118, rise: 208 },
    dx: 5,
    dy: -8,
    dScale: 0.026,
    dOpacity: 0.12,
    jitter: [13, 7, 4.2] as const,
    arcX: 140,
    arcY: -26,
    arcRot: 8,
    arcRotY: -16,
    perspective: 1200,
  },
} as const;

/* ------------------------------------------------------------------ *
 * Project page geometry
 * ------------------------------------------------------------------ */
export const CASE = {
  /** One shot per 780px of scroll, after a 200px lead-in. */
  step: 780,
  offset: 200,
  /** Tail past the last shot, where the return-to-deck ending plays. */
  tail: 1000,
  /**
   * Every device shape bottoms out on this baseline, so frames of different
   * proportions share one bottom edge. Authored against the 900px stage.
   */
  baseline: 689 / 900,
  /** Return-to-deck card, and the ghost cards that fan out behind it. */
  returnCard: { w: 260, h: 565, r: 36, top: 96 },
  ghosts: [
    { dx: 0, dy: 0, rot: 0, scale: 1 },
    { dx: -46, dy: 16, rot: -5.5, scale: 0.94 },
    { dx: 52, dy: 30, rot: 4.5, scale: 0.885 },
    { dx: -18, dy: 46, rot: -2.5, scale: 0.83 },
  ],
  /** Mobile carousel. */
  mobile: { w: 280, h: 609, r: 38, top: 106, gap: 14 },
} as const;

/** Viewport shapes the morphing project frame can take. */
export type ShotKind = "portrait" | "square" | "desktop" | "landscape";

export function frameBox(kind: ShotKind) {
  switch (kind) {
    case "square":
      return { w: 470, h: 470, pad: 0, r: 20, ir: 20, bar: false };
    case "desktop":
      return { w: 680, h: 425, pad: 0, r: 14, ir: 14, bar: true };
    case "landscape":
      return { w: 710, h: 400, pad: 0, r: 14, ir: 14, bar: false };
    default:
      return { w: 271, h: 589, pad: 8, r: 45, ir: 37, bar: false };
  }
}

/* ------------------------------------------------------------------ *
 * Breakpoints
 *
 * Two layouts are designed. Tablet is deliberately not — the handoff says to
 * scale the desktop layout rather than invent a third arrangement.
 * ------------------------------------------------------------------ */
export const BREAKPOINT = { desktop: 1100 } as const;
