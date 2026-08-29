import { springConfig } from "./spring";

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
 * Stage scale
 *
 * The handoff only ever contemplates viewports SHORTER than the authored
 * stage ("scale the desktop layout down rather than inventing a third
 * arrangement"). It says nothing about taller ones, so everything below the
 * ceiling here is authored, and the ceiling itself is an addition: above the
 * reference stage height the layout keeps growing to fill the viewport instead
 * of sitting at authored size in a sea of empty space.
 *
 * Whatever is left over once the scale clamps is split evenly above and below
 * the stage, so the composition stays centred rather than pinned to the top.
 * ------------------------------------------------------------------ */
export const SCALE = {
  /** Floor on short viewports. Below this the layout would stop being legible. */
  min: { desktop: 0.68, mobile: 0.72 },
  /**
   * Ceiling on tall ones. Without a cap a 1440px-tall display would ask for a
   * 1120px card; this stops the deck becoming billboard-sized.
   */
  max: 1.4,
  /**
   * Type grows at a fraction of the geometry rate, and only upward. A card can
   * afford to grow 40%; a 56px headline reads as shouting well before that.
   * Below the reference height type is left alone entirely — that is the
   * behaviour that shipped, and shrinking it was never asked for.
   */
  typeRate: 0.5,
} as const;

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
 * Springs, authored as stiffness + damping RATIO.
 *
 * The ratio is the half that carries the feel: 1 is critically damped, below
 * that it overshoots and rings, above it it drags. Because character and speed
 * are separated this way, stiffness can be retuned without the spring changing
 * personality — which is the point, since these get adjusted by eye.
 *
 * The three route-transition springs below were originally written as damping
 * coefficients; the ratios here reproduce them exactly, so converting the
 * authoring form changed no motion.
 */
export const SPRING = {
  /**
   * The deck itself. Every card runs its own copy of this, which is what lets
   * the stack move as six loosely-coupled objects rather than one rigid block.
   */
  deck: springConfig(80, 0.6),
  /**
   * Deck position travelling from one card to the next.
   *
   * This is the whole move, start to finish. Crossing the threshold commits to
   * it and this spring plays it out, so the shuffle is a single animation
   * rather than something the scroll scrubs frame by frame and can leave
   * parked half way.
   *
   * Half the speed of the deck spring, exactly: frequency goes as the square
   * root of stiffness, so a quarter of the stiffness is half the speed.
   */
  travel: springConfig(20, 0.9),
  /**
   * The card on its way to the back, and sitting there once it arrives.
   *
   * Firmer and much less bouncy than the front of the stack. It carries the
   * arc — the path that has to clear the other cards — and a card wobbling
   * around behind the deck after it lands pulls the eye to the least
   * interesting thing on screen.
   */
  toBack: springConfig(150, 0.85),
  /**
   * Card flying from deck to device frame, and the other five dropping away.
   * Both run the deck's spring: the complaint about the home-to-project move
   * was that it arrives as one rigid block, and giving the whole stack a
   * single slow, slightly underdamped spring is half of the fix — the other
   * half is the per-card stagger, which is what actually breaks up the block.
   */
  handoff: springConfig(80, 0.6),
  drop: springConfig(80, 0.6),
  /** Soft UI moves — ticks, labels. */
  ui: springConfig(400, 1.291, 0.6),
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
    /**
     * Throw distance, as a multiple of card WIDTH rather than a fixed number
     * of pixels.
     *
     * The authored 198px was 0.61 card-widths, which never moved the card far
     * enough to clear the stack before it dropped behind it — so at the moment
     * the depth flips, 39% of the card is still overlapping the stack and it
     * reads as passing through the other cards rather than going around them.
     * Past 1.0 the card is clear of its own footprint at the peak of the arc,
     * which is where the flip happens.
     */
    arcXWidths: 1.66,
    arcY: -40,
    arcRot: 7,
    arcRotY: -18,
    perspective: 1600,
    /**
     * Dwell on the first project.
     *
     * Scroll position maps straight to deck position, so without this the
     * first card arrives exactly as the intro ends and starts leaving on the
     * very next pixel — it is the only card with no resting range, which is
     * why it was the one that felt skipped. This gives it scroll room on both
     * sides, the way every later card gets from the step either side of it.
     */
    hold: 300,
    /**
     * As the front card leaves, the stack behind it pulls forward — a fraction
     * of one depth step, peaking mid-shuffle and settling back. This is what
     * stops the stack reading as a rigid block that the front card detaches
     * from; the cards look like they are taking up the space being vacated.
     */
    /**
     * The stack slides aside to let a card past, then comes back. Driven off
     * the same shuffle phase as the pull, so it is zero at rest and returns
     * exactly. Set to 0 to remove it.
     */
    shiftX: -20,
    pull: 0.26,
    /**
     * Degrees the same cards lean by while that happens. Small on purpose —
     * the read wanted here is a card scooting forward into the gap, and
     * rotation past a degree or so starts reading as a wobble instead.
     */
    pullRot: 0.55,
    /** Depths over which the pull tapers to nothing. */
    pullReach: 3,
    /**
     * Extra lean the cards carry while the deck is still assembling out of the
     * hero, resolving to their resting scatter as the intro completes.
     */
    introRot: 5,
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
    arcXWidths: 1.66,
    arcY: -26,
    arcRot: 8,
    arcRotY: -16,
    perspective: 1200,
    hold: 200,
    shiftX: -14,
    pull: 0.22,
    pullRot: 0.5,
    pullReach: 3,
    introRot: 4,
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
 * Deck motion
 * ------------------------------------------------------------------ */
export const DECK_MOTION = {
  /**
   * Per-card delay going back through the stack. Deliberately tiny — at 15ms
   * it does not read as a wave travelling down the deck, it reads as six cards
   * that are not bolted together. Much above this and it becomes a visible
   * ripple, which is a different and worse effect.
   */
  /**
   * How far into the next card the deck has to be dragged or scrolled before
   * the move commits. Once past it the animation plays in full and cannot be
   * parked half way; short of it the deck returns to where it was.
   */
  commit: 0.3,
  /**
   * Extra clearance, as a fraction of card width, that a departing card must
   * have beyond the stack's edge before it is allowed to drop behind it.
   *
   * The layer works out the stack's edge from transform values while the
   * browser composites a perspective on top, and the two agree only to within
   * a few pixels. Landing the flip exactly on the computed boundary therefore
   * lands it a few pixels either side of the real one, which is the difference
   * between going around the stack and clipping the corner of it. This buys
   * enough room that the sign of that error stops mattering.
   */
  clearMargin: 0.045,
  stagger: 0.015,
  /**
   * The same idea applied to the hero-to-deck intro, so the six cards arrive
   * one after another instead of as a single block sliding into place.
   */
  introStagger: 0.016,
  /** Longest delay any card takes, so a deep stack cannot lag absurdly. */
  staggerMax: 0.12,
} as const;

/* ------------------------------------------------------------------ *
 * Direct manipulation
 *
 * The front card can be picked up and thrown to the back. A plain click still
 * opens the project, so the two gestures have to stay separable: a press only
 * becomes a grab after it has been held, or after it has travelled far enough
 * that it was obviously never a click.
 * ------------------------------------------------------------------ */
export const DRAG = {
  /** Hold this long and the card comes loose under a stationary pointer. */
  longPress: 220,
  /** Or travel this far, so a quick flick doesn't feel stuck to the deck. */
  moveThreshold: 8,
  /** Under this much travel, a release is still a click and still navigates. */
  clickSlop: 6,
  /** Release faster than this and the card is thrown, whatever the distance. */
  flingVelocity: 520,
  /** Or drag it this far and let go, however slowly. */
  flingDistance: 96,
  /** Tilt while dragging, so the card banks into the direction of travel. */
  rotatePerPx: 0.05,
  rotateMax: 14,
  /** The held card lifts slightly out of the stack. */
  liftScale: 1.035,
  /**
   * While held, the card chases the pointer on a much stiffer, tighter spring
   * than the deck's own — a held object should feel attached to the hand, not
   * elastic. It is still a spring rather than a hard follow so that letting go
   * mid-throw hands real momentum to the fling.
   */
  followStiffness: 900,
  followRatio: 0.62,
  /** Velocity is averaged over this window, so one jittery frame can't fling. */
  velocitySamples: 5,
} as const;

/* ------------------------------------------------------------------ *
 * Breakpoints
 *
 * Two layouts are designed. Tablet is deliberately not — the handoff says to
 * scale the desktop layout rather than invent a third arrangement.
 * ------------------------------------------------------------------ */
export const BREAKPOINT = { desktop: 1100 } as const;
