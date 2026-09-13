import type { CSSProperties } from "react";
import { springConfig } from "./spring";

/**
 * Design tokens, transcribed from the handoff.
 *
 * Numbers here are authored values from the prototypes — treat this file as the
 * single source of truth and change geometry here rather than in components.
 */

/* ------------------------------------------------------------------ *
 * Type
 *
 * The whole scale, and the only combinations allowed. Sizes used to live
 * inline in six components, which is how the site ended up with six mono
 * sizes and eleven tracking values for what is really three mono roles and
 * seven sans ones. A role here is a complete instruction — size, leading,
 * weight, tracking, and the case and numeral behaviour that go with it — so
 * a component picks a role rather than assembling one.
 *
 * Sizes are authored against the 1440x900 stage and multiplied by the type
 * scale at the point of use, exactly as the geometry is.
 * ------------------------------------------------------------------ */
export type TypeRole = {
  size: number;
  line: number;
  weight: 400 | 500;
  track: string;
  mono?: true;
  upper?: true;
  tabular?: true;
};

export const TYPE = {
  /** Case study title. */
  display: { size: 56, line: 1.02, weight: 400, track: "-0.035em" },
  /** Home hero sentence. */
  hero: { size: 42, line: 1.18, weight: 400, track: "-0.025em" },
  heroMobile: { size: 26, line: 1.28, weight: 400, track: "-0.025em" },
  /** Active ledger row. */
  titleL: { size: 28, line: 1.1, weight: 400, track: "-0.025em" },
  /** Shot captions. */
  titleM: { size: 26, line: 1.14, weight: 400, track: "-0.02em" },
  /**
   * The mobile "now" title and mobile captions, which were 21 and 22 and a
   * different tracking each. One role at one size.
   */
  titleMMobile: { size: 22, line: 1.14, weight: 400, track: "-0.02em" },
  /** Inactive ledger rows. */
  titleS: { size: 20, line: 1.1, weight: 400, track: "-0.02em" },
  /** Case study overview. Held to `CASE.intro.colWidth`, about 55 characters. */
  body: { size: 18, line: 1.55, weight: 400, track: "0" },
  /**
   * The About page. It has no headline — the first sentence is set a step
   * up from the body and does that job — and its column is narrower than a
   * case overview's, so the body steps down to match.
   */
  aboutLead: { size: 20, line: 1.45, weight: 400, track: "-0.01em" },
  bodyS: { size: 16, line: 1.55, weight: 400, track: "0" },
  /** The name in the nav, and the only sans 500 on the site. */
  navName: { size: 15, line: 1, weight: 500, track: "-0.01em" },

  /* Mono is one size. Nav links, back link, kickers, field headings, caption
   * meta and the page index are all the same thing at the same weight. */
  label: { size: 11, line: 1, weight: 500, track: "0.1em", mono: true, upper: true },
  /** What sits under a field heading. Mixed case, so it reads as content. */
  value: { size: 11, line: 1.7, weight: 400, track: "0.04em", mono: true },
  /** Years and indices. Tabular, so a changing number does not jitter. */
  numeral: { size: 11, line: 1, weight: 400, track: "0.08em", mono: true, tabular: true },
} as const satisfies Record<string, TypeRole>;

/** A role, resolved at the current type scale. Spread into a `style`. */
export function type(role: TypeRole, ts = 1): CSSProperties {
  return {
    fontFamily: role.mono ? "var(--font-mono)" : "var(--font-sans)",
    fontSize: role.size * ts,
    lineHeight: role.line,
    fontWeight: role.weight,
    letterSpacing: role.track,
    ...(role.upper ? { textTransform: "uppercase" as const } : null),
    ...(role.tabular ? { fontVariantNumeric: "tabular-nums" } : null),
  };
}

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
/**
 * A gentle, symmetric ease. Equal on both sides, so it leaves and arrives at
 * the same unhurried rate — which is what the viewer's dip wants: pressed
 * rather than dropped, and settled rather than stopped.
 */
export const GENTLE = [0.33, 0, 0.67, 1] as const;
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
   * The departing card's own clock, driving it through a full arc.
   *
   * The swing used to be a function of how far the DECK had moved, so moving
   * the deck quickly compressed the arc: the card never reached full extent,
   * never got out past the stack, and cut the corner straight through it. A
   * card leaving the deck now runs its own timeline at its own pace, so the
   * trip out and back is the same shape whether it was nudged or thrown.
   *
   * Critically damped on purpose. Any overshoot would carry the clock past the
   * end of the arc, and the arc is a sine — past the end it turns negative and
   * the card swings back out the wrong side.
   */
  arcClock: springConfig(95, 1),
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
  travel: springConfig(32, 0.9),
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
  /**
   * The project page's viewer changing shape between one clip and the next.
   *
   * The frame is a single player that resizes itself to whatever is playing in
   * it, so the change of shape has to be a move rather than a cut — otherwise
   * the eye reads two different players rather than one adapting.
   */
  morph: springConfig(200, 1),
  /**
   * The viewer absorbing the arriving clip's momentum.
   *
   * Released from rest with a velocity rather than pulled toward a distant
   * target: its target is where it already is, so the whole motion is the
   * excursion and the return. Stiffness sets how quickly it gets back and,
   * with it, how far out it gets; the damping ratio is the character.
   *
   * Underdamped on purpose, and it is the one place on this page that should
   * be. This is a thing being knocked and recovering — the overshoot is the
   * recovery, not decoration. At 0.55 it swings out, comes back a little past
   * centre once, and settles.
   *
   * Softened from 140 alongside the arrival curve. Both moved the same way and
   * for the same reason: the beat wanted to be felt rather than watched.
   *
   * Being a pixel spring, it retires on `REST.px`, where a hundredth of a pixel
   * really is nothing — the tight `REST.unit` the dip needed does not apply.
   */
  carry: springConfig(85, 0.55),
  /**
   * The shot title changing under the viewer.
   *
   * A spring rather than the push's own curve, and stiffer than anything else
   * here. Put on the push's clock it was technically in step and felt late:
   * that curve is an ease-in-out chosen for a picture crossing a whole viewer
   * width, and a short line of type moving 34px does not need a slow start —
   * it just reads as lag. A stiff critically damped spring front-loads the
   * move, so the caption is legible almost immediately and settles under the
   * picture rather than alongside it.
   */
  title: springConfig(300, 1),
  /**
   * The progress ticks, widening into place.
   *
   * It shares the carry's damping ratio deliberately. The viewer's signature at
   * the end of a shot change is a small overshoot and a settle, and the tick
   * row is the only other thing on screen that marks the same moment — giving
   * it the same character makes it read as part of that event rather than as a
   * separate widget keeping score.
   *
   * Much stiffer, because it is a 16px move rather than a whole viewer, and
   * because it was a 450ms CSS ease before this and the lag was the complaint.
   * At 0.55 the active tick runs about 2px past its width and comes back.
   */
  tick: springConfig(320, 0.55),
  /** Soft UI moves — ticks, labels. */
  ui: springConfig(400, 1.291, 0.6),
} as const;

/* ------------------------------------------------------------------ *
 * Shadows
 * ------------------------------------------------------------------ */

/**
 * A deck card's shadow, at a given strength.
 *
 * A function rather than a string because the shadow has to be able to leave.
 * When the stack tidies itself away behind an opening project it converges on
 * one slot, and six shadows landing in the same place compound into a bruise
 * exactly where the composition is supposed to be getting cleaner. Strength 1
 * is the resting shadow and 0 is none, so the cards can put their shadows down
 * before they finish arriving.
 */
export function deckShadow(front: boolean, strength = 1): string {
  const k = strength < 0 ? 0 : strength > 1 ? 1 : strength;
  /**
   * Heavier than it was, and reaching further past the card's own edge.
   *
   * Nearly every clip is a white app screen, so a card overlapping another is
   * white on white and the shadow is the only thing drawing the boundary. The
   * spreads were pulled in far enough (-28 and -26 against blurs of 56 and 40)
   * that the shadow barely cleared the card it belonged to.
   */
  const cast = front
    ? { y: 30, blur: 58, spread: -22, alpha: 0.55 }
    : { y: 18, blur: 42, spread: -20, alpha: 0.48 };
  const edge = front ? 0.12 : 0.1;
  return (
    `0 ${cast.y}px ${cast.blur}px ${cast.spread}px ${castColour(cast.alpha * k)}, ` +
    `inset 0 0 0 1px ${edgeColour(edge * k)}`
  );
}

/**
 * The two shadow colours, at an alpha.
 *
 * Written against CSS custom properties rather than as finished colours so
 * they follow the theme: `--shadow-cast` and `--shadow-edge` hold channels,
 * and the per-theme multipliers scale every alpha on the site at once. The
 * arithmetic stays here because the alphas are animated — a card puts its
 * shadow down as it tidies away — and CSS has no way to be handed a number
 * that is changing every frame.
 */
export const castColour = (alpha: number) =>
  `rgb(var(--shadow-cast) / calc(${alpha.toFixed(3)} * var(--shadow-a)))`;
export const edgeColour = (alpha: number) =>
  `rgb(var(--shadow-edge) / calc(${alpha.toFixed(3)} * var(--shadow-edge-a)))`;

export const SHADOW = {
  cardFront: deckShadow(true),
  cardBack: deckShadow(false),
  /**
   * The viewer is not a card, and keeps its own.
   *
   * Everything else that is card-shaped now uses `cardFront` or `cardBack`:
   * the mobile carousel had a third value and the ghost fan a fourth, all
   * within a few percent of each other and of these two, which is four ways of
   * saying the same thing. A single object alone on an empty stage genuinely
   * does need a wider, softer shadow than one card in a pile, so this stays.
   */
  device: `0 36px 70px -34px ${castColour(0.5)}`,
} as const;

/* ------------------------------------------------------------------ *
 * Tidying away
 *
 * What the rest of the deck does while one card is opening into a project.
 *
 * It used to fall: every card still on the stack dropped off the bottom of the
 * screen with a lean on it. The count of objects going from six to one is half
 * of what signals the navigation, and falling certainly signalled it — but it
 * scattered the deck at the exact moment the page is meant to be resolving into
 * one thing, and it threw five cards AWAY from the one the eye is following.
 *
 * They square up instead. Every card converges on the slot the opened one is
 * leaving — same place, same size, no lean, no scatter — so the stack collapses
 * into a single clean card behind the viewer and fades from there. Same change
 * of count, arrived at by tidying rather than by scattering.
 * ------------------------------------------------------------------ */
export const TIDY = {
  /**
   * The opacity a card has left by the time its shadow has gone completely.
   *
   * The shadows lead the fade rather than going with it: the cards close the
   * last of the distance flat, which is what makes the stack read as squaring
   * up instead of piling up. At 0.6 the shadow is gone while the card itself is
   * still plainly there.
   */
  shadowGoneAt: 0.6,
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

/**
 * The deck dealing itself while nobody has scrolled yet.
 *
 * The stack is the thing on the landing screen and it was holding still,
 * which reads as a picture of a deck rather than a deck. It turns over on its
 * own instead, using the same shuffle a scroll drives — there is only one card
 * animation and this is it, on a timer instead of a wheel.
 */
export const HOME_IDLE = {
  /**
   * How long the card you arrive on is held before anything is dealt.
   *
   * Longer than the cadence that follows. The first card is the one someone
   * is actually reading — they have just landed, and the deck turning over
   * while they are still taking it in reads as impatience rather than as an
   * invitation.
   */
  first: 10000,
  /** Milliseconds a card rests at the front before the next one is dealt. */
  every: 3000,
  /**
   * How far down the intro the deck commits back to the first project, as a
   * fraction of it.
   *
   * Not on the first pixel of scroll. Started there, the turn back was over
   * before the stack had finished rising — the one moment it is worth
   * watching, spent on a screen that is still mostly hero. Held until the
   * intro is better than half done, the shuffle is still running as the deck
   * arrives, so scrolling down to the stack lands on cards in motion rather
   * than on a deck that has already settled.
   */
  settleAt: 0.55,
} as const;

/**
 * The landing sequence, typed.
 *
 * The sentence is set in full from the first frame and revealed behind a
 * cursor. "Hey," is typed slowly, a character at a time; the cursor then
 * sits and blinks for a beat; then it takes off — sweeping the rest of the
 * line and the line below at speed, the text appearing in its wake. When
 * it moves that fast its trailing edge lags behind its leading edge, so
 * it stretches into a box that smears across the line, the way a
 * fast-moving thing is drawn in old animation. The cards deal in as the
 * last line finishes.
 *
 * Times are seconds; the cursor's dimensions are in em of the hero size.
 */
export const HERO_TYPE = {
  /** Quiet before anything moves. */
  lead: 0.5,
  /** The cursor's blink: one full on-and-off cycle. */
  blink: 1.0,
  /** How long the cursor blinks alone before "Hey," is typed. */
  blinkIn: 0.9,
  /** Time between typed characters. */
  perChar: 0.17,
  /** The pause after "Hey,", blinking. The beat. */
  hold: 1.6,
  /** The sweep: how long the cursor takes to cross one full line. Shorter
   *  lines take proportionally less. */
  sweep: 0.26,
  /** A breath between lines, with the cursor already at the next line's
   *  start. */
  lineGap: 0.06,
  /**
   * The smear, from speed. The cursor's speed along the line is measured
   * in em per second; below `threshold` there is no tail at all, so typing
   * never smears, and above it the tail is `gain` em long for every em/s
   * over the threshold. The sweep's speed is what triggers it, so a faster
   * sweep is a longer smear. `rise` smooths the speed reading so a single
   * typed jump does not register as a burst; `relax` is how long the tail
   * takes to catch up once the cursor slows.
   */
  smear: { threshold: 20, gain: 0.03, rise: 0.05, relax: 0.08 },
  /** Cursor: width, its reach above and below the baseline, and a nudge
   *  along the line from where the text actually ends — all in em. */
  cursor: { width: 0.085, above: 0.76, below: 0.24, offset: 0.02 },
  /**
   * How the cursor crosses a line. `ease` runs it on a curve over `sweep`
   * seconds; `spring` runs it on physics and ignores `sweep`.
   */
  sweepMode: "ease" as "ease" | "spring",
  sweepEase: [0.4, 0, 0.2, 1] as [number, number, number, number],
  sweepSpring: { stiffness: 120, ratio: 1, mass: 1 },
  /**
   * The words, which come in against the cursor: it sweeps right and they
   * arrive from the right, each one starting as the cursor reaches it.
   */
  word: {
    /** How far a word travels in, in em. */
    travel: 0.5,
    /** Started this long after the cursor reaches the word — the stagger on
     *  top of the one the sweep already gives. */
    delay: 0.04,
    /** The spring it arrives on: stiffness, damping RATIO (1 is critically
     *  damped, below it overshoots), and mass. */
    stiffness: 170,
    ratio: 0.8,
    mass: 1,
    /** Fades in over this long, under the spring. 0 is no fade. */
    fade: 0.25,
  },
  /**
   * "Hey," is typed centred on its line. As the sweep begins the whole
   * line — cursor, clip and words — slides over to its seat on this
   * spring, and the words make their own entrances inside that slide, so
   * they follow "Hey" and arrive as well. `lead` starts the slide this long
   * before the sweep.
   */
  slide: { lead: 0.05, stiffness: 110, ratio: 0.9, mass: 1 },
  /** After the sweep the cursor blinks this long, then fades out. */
  blinkOut: 1.4,
  fadeOut: 0.5,
  /**
   * The sentence is typed in the middle of the screen. Once it is all in
   * it holds for a beat, and then the cards deal in from below while the
   * sentence rises to its seat above them on this spring.
   */
  holdIn: 1.0,
  rise: { stiffness: 60, ratio: 1, mass: 1 },
  /**
   * PARKED — nothing reads `ripple` or `hover` at the moment. The particle
   * layer they tune (`components/home/HeroPixels.tsx`) is kept in the repo
   * but no longer mounted on the site; see the note in HeroType.tsx.
   *
   * The ripple. As the fan rises a wave goes out from it through the
   * sentence, which for the duration is made of tiny cells — the text
   * re-drawn onto a canvas at its own positions and sampled into a grid —
   * each carried outward and scattered a little as the wave passes, then
   * settling back. The same wave, smaller, answers a hover from the pointer.
   * Distances in px at the 1440 stage; speed in px/s.
   */
  ripple: {
    /** Cell size, in DEVICE pixels: 1 is a single retina pixel, so at rest
     *  the sentence is indistinguishable from the type. */
    pixel: 1,
    /** Starts this long after the deal begins. */
    delay: 0.15,
    /** Where it comes from, as a fraction of the sentence box: below its
     *  bottom edge, in the middle. */
    origin: { x: 0.5, y: 1.9 },
    speed: 520,
    wavelength: 190,
    /** Width of the pulse, in px along the direction of travel. */
    width: 320,
    /** Peak displacement along the wave, px, and the random scatter on top. */
    amplitude: 6,
    scatter: 2.5,
    /** How much the cells fade at the peak, 0–1. */
    dim: 0.25,
    /** A train of pulses: how many, the time between them, and how much
     *  weaker each is than the one before (1 is all equal). */
    pulses: 2,
    pulseGap: 0.32,
    pulseDecay: 0.7,
  },
  /**
   * Hover: a particle system. Every cell has a velocity and a spring back
   * to its seat; the pointer throws the cells near it in the direction it
   * is moving, harder the faster it moves, and they swirl and settle. All
   * of it in px, px/s and seconds.
   */
  hover: {
    /** Reach of the pointer's influence, px. */
    radius: 80,
    /** Throw: cell acceleration per unit of pointer speed, at the centre. */
    force: 1.6,
    /** How much of the throw is outward from the pointer rather than along
     *  its motion, 0–1. */
    outward: 0.35,
    /** Pointer speed above which the throw stops growing, px/s. */
    maxSpeed: 2500,
    /** The spring home: stiffness and damping ratio. */
    stiffness: 90,
    ratio: 0.45,
  },
} as const;

/**
 * The landing sequence.
 *
 * Nothing is on screen at first. "Hey" arrives from the right, alone in the
 * middle of its line, and the mark after it is an exclamation point drawn
 * as paths — a stem that rises out of its dot, carried past its resting
 * height as anticipation, held, and then dropped back into the dot; the
 * dot then morphs, point for point, into the comma the sentence actually
 * needs, and springs back a little to resolve the fall. The rest of the
 * sentence follows a word at a time from the right while "Hey" slides over
 * to make room for it. Only once the last word is in do the cards deal
 * themselves onto the screen underneath.
 *
 * Everything here is slow on purpose: it is the first thing on the site
 * and it is meant to be watched, not gotten through. Times are seconds;
 * distances are authored pixels at the 1440 stage, scaled at the point of
 * use, unless marked as em.
 */
export const HERO_INTRO = {
  /** Quiet before anything moves. */
  lead: 0.6,
  /**
   * The text entrances, as one spring — snappy in, gentle to rest. Every
   * word and "Hey" itself use it, and so does the slide that carries the
   * whole line over, so nothing on the line moves at a rate the rest does
   * not share.
   */
  spring: { type: "spring", visualDuration: 1.15, bounce: 0.14 },
  hey: {
    /** How far "Hey" travels as it arrives. Short: a settle, not a slide. */
    travel: 26,
    /** Its fade, which rides under the spring. */
    fade: 0.7,
  },
  /**
   * The mark. Geometry lives with the paths in BangComma; these are its
   * clocks, in order. It arrives whole, as an exclamation point, rising and
   * accelerating into a peak where the stem stretches; it then drifts back
   * toward its seat without ever quite stopping, collapses, and the dot
   * becomes the comma.
   */
  bang: {
    /** Starts this long after "Hey" begins arriving. */
    at: 0.5,
    /** How far below its seat the whole mark starts, in em. */
    from: 0.05,
    /** The fade in, riding under the open. */
    fade: 0.18,
    /** The open: the stem shoots from nothing to past its height. Quick. */
    rise: 0.36,
    /** How far past its seat the top of the stem goes, in em. */
    overshoot: 0.12,
    /** The ease at the top — it slows, but only for a moment, and ends this
     *  fraction of the overshoot still above the seat, so it is still
     *  moving when it snaps down. */
    drift: 0.32,
    driftRest: 0.25,
    /** The snap back down into the dot. */
    collapse: 0.2,
    /** The dot becoming the comma: out past the comma's shape... */
    morphOut: 0.3,
    /** ...by this much (1 is the comma exactly), and back. */
    morphOvershoot: 1.22,
    morphBack: 0.6,
  },
  rest: {
    /** The remaining words start this long after the collapse lands. */
    after: 0.35,
    /** The line starts sliding to its seat this long before the words
     *  come, so the space beside "Hey" is opening as they land in it. */
    lead: 0.3,
    /** Each word arrives this much after the one before it. */
    stagger: 0.07,
    /** Each word's own entrance, inside the line that carries it. */
    travel: 22,
    fade: 0.8,
  },
  deal: {
    /** The cards start rising this long before the last word is fully in,
     *  so the two overlap at the tail rather than queueing. */
    lead: 0.9,
    duration: 2.8,
    /** How far below their seats the cards start, in card heights. Enough
     *  that the front card, which sits low on the landing screen, is fully
     *  under the bottom edge before the deal. */
    riseHeights: 1.15,
    /** The fan opens over the second part of the rise: cards arrive as a
     *  stack, then sprawl. 0–1 fraction of the deal at which the spread
     *  begins. */
    spreadFrom: 0.3,
  },
} as const;

/**
 * How the hero sentence leaves as the deck assembles under it.
 *
 * It used to slide up and to the left while it faded, which put the sentence
 * and the stack in motion in two different directions at the same moment —
 * and travelling to a corner reads as the text being swept out of the way,
 * as though it were in the way. It settles back instead: the same fade, and
 * a small scale about its own centre, so it recedes on the spot and lets the
 * phone rising underneath be the only thing that moves.
 */
export const HERO_EXIT = {
  /**
   * How fast it fades against intro progress. 1.9 means gone by the time the
   * deck is half assembled, which is what keeps it clear of the stack.
   */
  fade: 1.9,
  /**
   * Where the scale finishes, reached on the fade's clock rather than the
   * intro's — a scale still running after the text is invisible is a scale
   * nobody sees, and the two read as one gesture only if they end together.
   *
   * Small on purpose. Past a few percent this stops reading as type settling
   * back and starts reading as a zoom.
   */
  scale: 0.94,
} as const;

/**
 * The word "motion" in the hero, on hover.
 *
 * The ink crossfades out and a spiral, clipped to the letterforms, turns
 * underneath — painted per pixel by HeroWord, since no CSS gradient can
 * spiral. It is a logarithmic spiral, which is the kind that tightens as it
 * winds in, drawn about a centre held just below the word so the arms are
 * felt converging without the eye of it ever being on screen.
 *
 * Two spirals are summed: a coarse one that carries the turn, and a fine
 * one riding on it at a fraction of the weight, so the surface has depth
 * rather than reading as one rotating sheet.
 */
export const HERO_GRADIENT = {
  /** How long the ink takes to give way to colour, in ms. Slow on purpose:
   *  the hand arrives and the word warms rather than switches. */
  fadeIn: 900,
  /** And how long it cools back to ink when the hand leaves. */
  fadeOut: 1400,
  /** Where the spiral winds toward, as a fraction of the word's box. Below
   *  the baseline and left of centre, so the arms sweep across the letters
   *  on a diagonal rather than fanning symmetrically out of the middle. */
  centre: { x: 0.42, y: 1.35 },
  /** Softens the singularity: radius is measured in em, and this is added
   *  before the log so the winding cannot run away at the centre. */
  eye: 0.35,
  /** The turn itself. `arms` is how many colour laps go once around the
   *  centre; `wind` is how many laps happen per e-fold of radius, which is
   *  what sets how steeply the arms wind — 0 would be a plain pinwheel;
   *  `period` is seconds for one lap of colour to pass a point. */
  coarse: { arms: 1, wind: 4, period: 5 },
  /** A tighter, faster spiral summed onto the phase at `weight` radians of
   *  amplitude. Small: it is texture on the turn, not a second turn. */
  fine: { arms: 2, wind: 6, period: -3.5, weight: 1.3 },
  /** Three stops, so at most two are ever blending at a point and the
   *  word reads as colour moving rather than as a rainbow. Hex, because the
   *  canvas mixes them itself in linear light. */
  stops: ["#c85a34", "#e3a12e", "#22566b"],
} as const;

export const DECK = {
  desktop: {
    /** Scroll distance for the hero-to-deck intro, and per project after that. */
    intro: 440,
    step: 440,
    /** Authored card is 322x700 at the 1440x900 reference. */
    cardHeight: 700,
    cardHeightMin: 470,
    /**
     * Deck origin travels as the hero leaves: centred, then out to the right.
     *
     * Pushed further right than the authored 985 to open up the gap between
     * the ledger and the stack — the two were crowding each other, and cards
     * now swing to the left as well as the right, so the deck needs air on
     * both sides rather than just one.
     */
    cx: [720 / 1440, 1046 / 1440] as const,
    cy: [1075 / 900, 495 / 900] as const,
    /**
     * How much bigger the stack is before the deck assembles, and 1 once it
     * has. Same shape as `cx`/`cy`: the landing state and the deck state, read
     * off the intro.
     *
     * A scale rather than a bigger card, because the two states want different
     * sizes and only one of them has room to choose. The deck state has the
     * ledger beside it and the full height of the stage to sit inside — at
     * 700 the card already leaves about 57px top and bottom, so growing the
     * card itself runs out of stage almost immediately. The landing state has
     * no such limit: the phone is meant to be too big for the frame and to
     * show only its top, so it is scaled up and its centre pushed below the
     * bottom edge. Shrinking back to 1 as the deck arrives is then the same
     * gesture as the rise — the phone recedes into the stack rather than
     * cutting to a different size.
     */
    heroScale: [1.62, 1] as const,
    /** Depth-stack offsets per card behind the front one. */
    dx: 9,
    dy: -15,
    dScale: 0.028,
    /**
     * Depth is painted, not faded.
     *
     * No card on the deck is ever transparent. Cards further back are veiled
     * with a wash of the page colour instead, which sits ON them rather than
     * letting the card beneath show through. Transparency was reading as a
     * rendering fault — a half-visible card lying over the deck — and it also
     * made the departing card vanish at the very moment it was supposed to be
     * seen sliding in behind the others.
     */
    /**
     * How many cards read as the solid front of the stack.
     *
     * Nothing to do with the wash any more — that ramps from the front card
     * back. This is what a card leaving has to clear on its way round: past
     * this depth a card is washed and sits behind the ones in front of it, so
     * the sliver of it that protrudes cannot show a card passing over it.
     */
    opaqueDepth: 2,
    /**
     * The wash on the card at the very back. Every card in front of it gets a
     * share of this in proportion to how far back it sits.
     *
     * Raised from 0.55, and it now describes the deepest card rather than
     * capping a per-step sum, so it is the actual darkest value on screen.
     */
    maxScrim: 0.72,
    /**
     * Where in its trip to the back the departing card starts to take the
     * wash. It stays clear while it is still passing in front of the stack.
     */
    fadeStart: 0.55,
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
    arcXWidths: 1.48,
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
     * How far the cards lean, alternating sides down the stack.
     *
     * Five degrees, as it was before the fan. Taking it out left the deck
     * too square: the lean is part of what makes the stack look arranged.
     * The fan hides it on the landing screen, and it comes in as the deck
     * assembles. Seeded by slot (see `deckCard`), the cards sit at 0, 6.2,
     * -8.05, 6.09 and -9.44 degrees from the front back at every project.
     */
    lean: 5,
    /**
     * The landing fan.
     *
     * Before the deck assembles it sits fanned like a hand of cards: the front
     * card square to the viewer, the rest splayed either side of it around a
     * pivot below the stack, the deepest straight behind. `spread` is how far
     * the outermost card turns; `pivot` is how far below a card's centre the
     * fan turns about, in authored pixels, before the landing scale. Both
     * resolve to nothing as the intro completes, so the fold, the shrink and
     * the travel to the right are one move — and the lean the stack keeps is
     * what the fan folds back down to.
     *
     * An angle per card, written out by hand, is what this was: six of them,
     * ending in a zero that kept the deepest card square. The deck is five
     * cards now, so the list ran out one short and the deepest card took the
     * FIFTH angle — 22 degrees — while the arc that delivers it there carries
     * no fan at all. Every card dealt to the back arrived square and then
     * snapped 22 degrees the moment it counted as resting. The angles are
     * derived from the deck's own size instead, so the two ends are always
     * zero however many projects there are. Six cards still resolve to exactly
     * the hand-written set.
     */
    fan: { spread: 22, pivot: 360 },
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
    opaqueDepth: 2,
    maxScrim: 0.72,
    fadeStart: 0.55,
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
    lean: 4,
    fan: { spread: 12, pivot: 260 },
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
   * How much scroll past the last shot the return-to-deck ending occupies, in
   * shots. `returnProgress` reads it, and so does the snap point that marks
   * where the ending has finished.
   */
  returnSpan: 0.85,
  /**
   * Every device shape bottoms out on this baseline, so frames of different
   * proportions share one bottom edge. Authored against the 900px stage.
   *
   * Still used for the intro screen. The shots no longer sit on it — see
   * `centreY`.
   */
  baseline: 689 / 900,
  /**
   * Shots are centred on this line instead of sharing a bottom edge.
   *
   * A shared baseline suits frames that are only ever swapped. These are
   * morphed: one player growing and shrinking, and a shape change reads as one
   * object changing when it happens around a fixed centre, but as two
   * different objects when the bottom edge stays put and the top jumps.
   * Slightly above the middle of the stage to leave the caption room.
   */
  centreY: 430 / 900,
  /** Where the shot title and its meta line sit, clear of the largest frame. */
  /**
   * Air between the bottom of the viewer and the top of its caption.
   *
   * The caption's position is derived from this and `roomH` rather than
   * authored — see `caseCaption`. The two used to be independent numbers that
   * happened to land 6px apart, which is not a decision anyone made: the
   * caption sat almost against the frame, and any change to either value moved
   * that gap without anyone noticing.
   *
   * Much larger than the space BELOW the caption, and deliberately so. The
   * caption and the tick row belong together — one names the shot, the other
   * says which shot it is — so the gap that matters is the one separating that
   * pair from the viewer, not the one inside it. 36 above, 9 below.
   */
  captionGap: 36,
  /**
   * How far the tick row sits above the bottom of the stage.
   *
   * Was 46, then 22. Back up a little, because the caption and the tick row
   * are one group — the caption names the shot and the row says which shot it
   * is — and 19px apart read as two separate things stranded under the viewer.
   * Every pixel this gains, and every pixel `captionGap` gains, comes out of
   * the space between them: 19px became 9.
   */
  ticksInset: 26,
  /**
   * How far the shot title travels as it changes, authored against the stage.
   *
   * Sideways, in the same direction the picture goes, because it is a caption
   * for something that slides — a title rising and falling under a viewer whose
   * contents move horizontally reads as a second, unrelated animation happening
   * to coincide.
   *
   * Much shorter than the push, which crosses a whole viewer width. The title
   * is a short centred line with nothing to hide behind, so it only has to
   * suggest the direction rather than travel it.
   */
  titleShift: 34,
  /**
   * Space kept either side of the stage, so a wide frame never runs to the edge.
   *
   * It also has to clear the step arrows, which live outside it: the arrow mark
   * reaches `arrowInset + 37` = 85 in from the edge, so at the old 96 a fitted
   * landscape frame passed within 9px of it on a tall window. Far enough out now
   * that the arrow keeps its own air whatever shape the viewer takes.
   */
  gutter: 108,
  /**
   * The tallest the viewer is allowed to be, authored against the 900px stage.
   *
   * The horizontal counterpart to `gutter`, and the other half of the fit: the
   * frame is contained inside BOTH budgets rather than sized by height and then
   * clamped by width.
   *
   * The viewer gets the room first, and what is below it fits underneath.
   *
   * It was briefly cut to 566 to buy the caption some air, which is the wrong
   * trade: the viewer is the thing being looked at, and shrinking it 13% to
   * move a 26px line is paying far too much. The air came from moving the
   * caption and the tick row down instead — see `captionGap`.
   *
   * The one thing it must not do is exceed the room: the `desktop` frame was
   * 728 and ran 32px PAST the caption line, so the caption, drawn above the
   * viewer, sat over the bottom of the footage.
   */
  roomH: 652,
  /**
   * The intro arriving, element by element.
   *
   * The screen used to be there the moment the route changed — the card flew
   * in from the deck and the whole column of type was simply already present
   * behind it, which reads as the page having been waiting rather than being
   * built. Everything here is about order: what arrives, in what sequence, and
   * how far behind the thing before it.
   *
   * The title is deliberately absent from this list. It is the one piece that
   * does not fade in, because it is the same words that were in the ledger a
   * moment ago and should travel rather than appear.
   */
  enter: {
    /**
     * How long the column waits before anything starts.
     *
     * The card is still crossing the page at this point. Starting underneath
     * it puts two things in motion at once and the eye picks the bigger one,
     * so the type would arrive unwatched.
     */
    lead: 160,
    /** Between one element and the next. */
    stagger: 90,
    /** A fade and its rise. */
    ms: 420,
    /** How far a fading element comes up from, in authored px. */
    rise: 10,
    /**
     * The rule drawing itself out of its own middle.
     *
     * Slower than a fade and on its own timing: it is a line being drawn, and
     * a drawn line that finishes at the same moment as the text either side of
     * it reads as a box appearing rather than a stroke.
     */
    ruleMs: 560,
  },
  /**
   * The intro screen's horizontal frame.
   *
   * Everything on this screen used to sit at a different distance from its own
   * edge: the back link 64 from the left, the type column 120, and the viewer
   * 200 from the right. Three margins reading as three unrelated decisions, and
   * the smallest of them — the back link — pinned to the corner.
   *
   * They are one margin now. `rail` is the left edge that the header and the
   * type column share, and `frameRight` is the air kept to the right of the
   * viewer; setting them equal lands the whole composition on a symmetric
   * margin. Both moved the same distance to get there, so the intro is the same
   * arrangement translated right rather than a re-layout — the type opened up
   * on the left, the viewer moved out with it, and the space between them is
   * untouched.
   *
   * `rail` scales with type and `frameRight` with geometry, each following what
   * it actually holds.
   */
  intro: {
    rail: 160,
    /**
     * The viewer sits much closer to its edge than the type does to the other
     * one. Deliberately lopsided: the type column is a block of reading and
     * wants a rail to sit on, while the viewer is the thing being looked at and
     * wants to be out at the extent of the page. Balanced margins made it read
     * as pulled in toward the middle.
     *
     * It stops here rather than going further because of the step arrows: the
     * right arrow's mark reaches `arrowInset + 37` in from the edge, and the
     * viewer has to clear it by enough that the two do not read as touching.
     * Pushing this lower means moving the arrows in with it.
     */
    frameRight: 112,
    /** Measure of the type column. Long enough for the overview to breathe. */
    colWidth: 470,
  },
  /**
   * How far the step arrows sit in from the viewport edge.
   *
   * They are viewport furniture rather than part of the composition, so they
   * keep their own lane outside everything else — but at 34 they were pinned to
   * the glass, which reads as tight on a wide window. Far enough in now to look
   * placed, still clearly outside the content.
   */
  arrowInset: 48,
  /**
   * The push: the outgoing clip leaves the mask as the incoming one arrives.
   *
   * The channel the viewer was missing. A transition has shape, position,
   * content and time to work with, and this page was using shape almost alone —
   * which fails completely for a run of clips that ARE the same shape. Several
   * phone recordings in a row are all portrait and all the same size, so no
   * amount of authoring their boxes can distinguish them. Position always can.
   *
   * A push, not a crossfade. Both clips stay fully opaque and one leaves as the
   * other arrives, so there is never a moment where two half-transparent
   * pictures are on screen and neither is legible. It also carries a direction,
   * which ties the change to the scroll that asked for it.
   *
   * Distances are fractions of the frame's own width, so the gesture is the
   * same size on any viewport.
   */
  push: {
    /**
     * Never nothing. A shot change always pushes at least this far, so the
     * grammar of the sequence is the same every time rather than something
     * that appears and disappears depending on the pair of clips involved.
     */
    /**
     * Currently equal to `max`, which means every shot change gets the full
     * push and `pushFalloff` has nothing to do.
     *
     * It went to 0 first — suppressing the push entirely once the aspect turned
     * far enough — on the reasoning that a viewer becoming a desktop window is
     * already the most dramatic thing on the page and does not need help. True
     * of the morph in isolation, but it left the page with two different
     * grammars: some changes slid and others only resized, and which one you
     * got was unpredictable from the outside. A transition that surprises you
     * by being absent is worse than one that is merely emphatic.
     *
     * So: everything pushes, and everything overshoots. Pull this back down to
     * bring the falloff back into play.
     */
    min: 1,
    /**
     * What a change of shape that says nothing gets: a full push, the outgoing
     * clip leaving as the incoming one takes its place. This is the carousel
     * move, and it is the whole reason the channel was added — a run of
     * identically shaped clips has nothing else, so it gets everything.
     */
    max: 1,
  },
  /**
   * How much of an ASPECT change is enough to carry a transition on its own.
   *
   * Measured as |ln(a₂/a₁)|, which is the scale-free way to compare two
   * proportions: it treats 4:3 → 16:9 as the same size of change as 16:9 → 4:3,
   * which a plain difference does not.
   *
   *   square → square      0.00   full push
   *   1.00 → 0.96          0.04   ~90%
   *   desktop → landscape  0.24   ~30%
   *   portrait → desktop   1.11   none
   *
   * An earlier version measured how far the frame's EDGES moved and took the
   * axis that moved less, on the theory that a box growing along one axis while
   * the other holds still reads as a stretch. True as far as it went, but it
   * gave portrait → desktop a full push, and that pair is precisely the one
   * that turned out to look messy. What the morph can carry is a change of
   * proportion, and that is what this measures.
   */
  pushFalloff: 0.35,
  /**
   * How much of the push the viewer's change of shape takes, 0–1.
   *
   * Below 1 the frame finishes early and the picture keeps crossing under a
   * viewer that has already arrived. Still one clock — both are read from the
   * same `t`, so the shape can lead the content by a stated amount but cannot
   * drift from it.
   *
   * At 0.7 the shape lands at 308ms and the picture at 440ms. Leading reads as
   * the viewer opening to receive what is coming rather than being dragged
   * along by it. Its cost is directional: a GROWING frame that finishes first
   * is wider than the clips have yet spread, so bare viewer shows at the
   * trailing edge until they catch up. Shrinking is free.
   */
  morphSpan: 0.7,
  /**
   * How long the push takes, in milliseconds.
   *
   * Longer than the dip's descent on purpose. The press is a reaction and wants
   * to be quick; the push is the content actually being replaced and has to be
   * followable — a slide fast enough to be missed defeats the point of adding
   * it. On the house curve, like every other position move here.
   */
  pushMs: 440,
  /**
   * How long after the push lands before the arriving clip starts playing, ms.
   *
   * It used to start the instant the shot changed, so the clip was already
   * running while it slid across — the motion you were meant to be watching
   * began off to one side, half of it out of frame, and by the time it settled
   * you had missed the opening. It now sits on its first frame for the crossing
   * and starts once it has arrived and had a moment to be seen.
   */
  playDelay: 200,
  /**
   * The carry: the arriving clip hands its momentum to the viewer.
   *
   * This replaced a scale dip. The dip pressed the viewer smaller and let it
   * back up, which was legible but fought the push — the picture was travelling
   * sideways while its container shrank, two motions on different axes at the
   * same instant, and the eye could not read them as one event.
   *
   * The story is a collision. The incoming clip is still moving when it lands,
   * and at the moment it lands that speed is handed to the frame.
   * The clip stops dead inside the viewer and the VIEWER carries on, shoved a
   * little further in the direction the picture was going, then springs back.
   * Momentum is conserved across the handoff, so there is no seam to tune: the
   * curve ends at exactly the velocity the spring begins with.
   *
   * Everything about how it FEELS is here and in `SPRING.carry`.
   */
  carry: {
    /**
     * The curve the clip arrives on. The number that matters is its exit slope:
     * (1 − y₂)/(1 − x₂), which IS the handoff velocity — the whole transfer is
     * decided by it.
     *
     * Tuned by eye to an S, easing at both ends, exiting at 0.44× its average
     * speed. That is a deliberate walk-back from where this started. The first
     * version exited at 1.38× — still accelerating as it landed — on the theory
     * that a collision needs a real impact to transfer. It does, and it read as
     * one: a 17px shove every time the shot changed, which is a lot of event
     * for stepping through a portfolio.
     *
     * At 0.44 the clip is settling as it arrives and hands over 522px/s instead
     * of 1890, which the spring turns into a 6px lean. Present rather than
     * announced. The mechanism is unchanged and still seamless; what changed is
     * how hard it is asked to hit.
     *
     * Raise the exit slope to arrive harder, lower it to arrive softer.
     */
    ease: [0.35, 0, 0.57, 0.81] as const,
    /**
     * How much of the clip's speed the viewer takes on, 0–1.
     *
     * The mass ratio of the collision, in effect. This is the knob for how far
     * the viewer travels: the excursion is very nearly proportional to it.
     */
    transfer: 0.22,
    /**
     * Ceiling on the excursion, in pixels.
     *
     * The handoff velocity scales with the push distance, and the push distance
     * scales with the frame — so without this a wide frame throws the viewer
     * further than a narrow one for the same event. A stated maximum keeps the
     * nudge the same size whatever is playing.
     */
    maxPx: 26,
  },
  /** Return-to-deck card, and the ghost cards that fan out behind it. */
  /**
   * A desktop card, so it takes the desktop card radius — 44, the same as the
   * deck's own (`RADIUS_RATIO` lands on 44.05 at the reference width) and the
   * same as the portrait viewer. It was 36, which is the mobile value.
   */
  returnCard: { w: 260, h: 565, r: 44, top: 96 },
  ghosts: [
    { dx: 0, dy: 0, rot: 0, scale: 1 },
    { dx: -46, dy: 16, rot: -5.5, scale: 0.94 },
    { dx: 52, dy: 30, rot: 4.5, scale: 0.885 },
    { dx: -18, dy: 46, rot: -2.5, scale: 0.83 },
  ],
  /** Mobile carousel. */
  /** The mobile card. 36, not 38 — one radius for this object everywhere. */
  mobile: { w: 280, h: 609, r: 36, top: 106, gap: 14 },
} as const;

/** Viewport shapes the morphing project frame can take. */
export type ShotKind = "portrait" | "square" | "desktop" | "landscape";

/**
 * The shape the viewer takes for a clip.
 *
 * No device frames: no phone bezel, no window title bar. The viewer is a
 * rounded rectangle holding the footage and nothing else, so `pad` is always
 * zero and there is no chrome to draw. Dressing a screen recording in a
 * hardware frame adds a second subject to look at.
 *
 * The sizes below set how much room a clip of that sort gets, and its own
 * proportions do the rest: a tall clip is given a height and takes whatever
 * width follows, a wide one is given a width and takes the height. Authoring
 * both numbers is what cropped the footage — the boxes were tidy proportions
 * and the clips are whatever they are, so five of them lost 12% of the picture
 * to the difference. `caseFrame` then fits the result inside the stage, so
 * these can be generous.
 *
 * The portrait radius is 44 — the desktop card radius, shared with the deck
 * and the return card, because all three are the same phone. It was 46, which
 * was a fourth value for one shape.
 *
 * The window shapes keep their own smaller radii. They are not phones: a
 * desktop recording in a 44px-rounded box reads as a phone showing a website.
 * `ir` equals `r` throughout because `pad` is 0 — there is no bezel to have an
 * inner corner inside of.
 *
 * The heights are meant to agree. Anything held to a height is held to
 * `CASE.roomH`, which is the height the stage has to give — so a square and a
 * portrait recording are the same height on the page and differ only in how
 * much width their own proportions ask for. The square box was 520 against
 * portrait's 652, and since the fit only ever shrinks, nothing downstream ever
 * took that back: a square clip simply sat at 80% of the height everything
 * around it was using, with the difference showing as empty room above and
 * below it.
 */
export function frameBox(kind: ShotKind, aspect?: number) {
  const box =
    kind === "square"
      ? { w: 652, h: 652, pad: 0, r: 22, ir: 22, bar: false }
      : kind === "desktop"
        ? { w: 1020, h: 638, pad: 0, r: 18, ir: 18, bar: false }
        : kind === "landscape"
          ? { w: 1065, h: 600, pad: 0, r: 18, ir: 18, bar: false }
          : { w: 300, h: 652, pad: 0, r: 44, ir: 44, bar: false };

  if (!aspect || !Number.isFinite(aspect)) return box;
  // Tall clips are held to a height, wide ones to a width — whichever is the
  // dimension actually competing for room on the stage.
  return aspect < 1.05
    ? { ...box, w: box.h * aspect, h: box.h }
    : { ...box, w: box.w, h: box.w / aspect };
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
   * How much wider each card's arc gets than the one behind it, when several
   * are travelling at once.
   *
   * With every card going round the same side they share a path, so fanning
   * them by where they are headed is what keeps them off each other. Kept
   * modest: at 0.38 the lead card's swing read as too big on its own.
   */
  arcSpread: 0.22,
  /**
   * How far back the deck will actually reverse before it goes the other way
   * round instead.
   *
   * The deck is a ring, so returning to an earlier project is never further
   * than half a lap either way — from the fourth card the first is three back
   * or three forward, and from the fifth it is four back but only two forward.
   * Going forward is also the motion the deck is built around: cards leaving
   * the front and slotting in behind. Reversing more than a couple of cards
   * means running that backwards several times over, which is where it gets
   * busy. Short hops back still reverse, because for one card that reads as
   * undoing rather than as travelling.
   *
   * Scrolling is exempt: there the scroll position IS the deck position, and
   * making the deck run forward while the wheel goes backward would be a lie.
   */
  reverseMax: 2,
  /**
   * The most cards one continuous scroll is allowed to turn through.
   *
   * Deliberately small. The deck loops, so an unlimited flick spins it through
   * the whole list and out the other side like a slot machine — and there is
   * nothing to be gained from that: nobody reads six projects going past at
   * speed. Two cards a gesture keeps the deck something you step through
   * rather than something you can send spinning, and moving further stays
   * possible, it just has to be asked for again.
   */
  maxPerGesture: 2,
  /**
   * Quiet time that ends one scroll and begins the next, in milliseconds.
   *
   * A wheel or trackpad sends a stream of small events, so a gesture has to be
   * inferred from the gaps between them. Long enough to hold a flick and its
   * coasting together as one movement; short enough that deliberately
   * scrolling again is immediately allowed to keep going.
   */
  gestureGap: 180,
  /**
   * When several cards are travelling at once, send them round alternate
   * sides of the stack rather than all the same way.
   *
   * A group all sweeping right traces one path and piles up; splitting them
   * left and right halves the traffic on each side and reads as a deck being
   * riffled rather than a queue being processed. A card travelling alone is
   * unaffected — it goes the way it was sent.
   */
  alternateSides: false,
  /**
   * Ceiling on how fast the deck travels, in cards per second.
   *
   * A safety bound, not a correctness one. It used to be set low enough to
   * force a multi-card jump through every card in turn, because the departing
   * card was a spring chasing its arc and at speed it never got far enough out
   * to clear the stack. That lag is gone — the card in transit now follows its
   * arc exactly — so the deck is free to move at the speed its own spring
   * wants, and a jump across four cards takes about as long as a jump across
   * one, which is the nature of a spring.
   */
  maxRate: 10,
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
  /**
   * Distance no longer lives here: how far a drag has to travel is judged in
   * deck units against `DECK_MOTION.commit`, so it means the same thing on a
   * phone as on a wide display and lines up with the threshold a scroll has to
   * cross. Only speed is a pixel quantity, because speed is about the hand.
   */
  /**
   * How much of a vertical drag the held card takes on.
   *
   * Damped rather than one-to-one: the card is travelling a fixed arc, and
   * following the finger up and down in full fights that. Enough to feel
   * picked up, not enough to leave the path.
   */
  verticalGive: 0.25,
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
