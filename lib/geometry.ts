import {
  CARD_RATIO,
  RADIUS_RATIO,
  DECK,
  CASE,
  DESKTOP_REF,
  MOBILE_REF,
  SCALE,
  frameBox,
  type ShotKind,
} from "./design";
import { clamp, clamp01, lerp, smoothstep } from "./spring";

/** Everything the media layer needs to paint one card, in stage pixels. */
export type Geo = {
  x: number;
  y: number;
  w: number;
  h: number;
  radius: number;
  /** Bezel thickness. Non-zero only for the portrait device frame. */
  pad: number;
  /** Inner screen radius, which differs from the outer while a bezel exists. */
  innerRadius: number;
  rotate: number;
  rotateY: number;
  scale: number;
  opacity: number;
  /**
   * Wash of page colour laid over the card, 0 to 1. This is how depth is
   * shown — a veil ON the card rather than transparency THROUGH it, so a card
   * further back never lets the one beneath it show.
   */
  scrim: number;
  z: number;
};

export type Stage = {
  /** Stage box — the centred 1440-max band on desktop, the viewport on mobile. */
  w: number;
  h: number;
  mobile: boolean;
  /** Uniform scale applied to authored geometry. 1 at the reference height. */
  s: number;
  /**
   * Type scale. Tracks `s` upward at a reduced rate and never goes below 1 —
   * type that grows as fast as the cards ends up shouting.
   */
  ts: number;
  /**
   * Vertical offset of the scaled authored stage inside the viewport. Zero
   * wherever `s` is unclamped; non-zero only once the scale hits a limit and
   * there is slack to centre.
   */
  top: number;
};

export function makeStage(vw: number, vh: number, mobile: boolean): Stage {
  const ref = mobile ? MOBILE_REF : DESKTOP_REF;
  const min = mobile ? SCALE.min.mobile : SCALE.min.desktop;
  const s = clamp(vh / ref.h, min, SCALE.max);
  return {
    w: mobile ? vw : Math.min(vw, DESKTOP_REF.w),
    h: vh,
    mobile,
    s,
    ts: 1 + Math.max(0, s - 1) * SCALE.typeRate,
    // Split the slack. Inside the unclamped range this is exactly 0, so the
    // designed viewports are untouched.
    top: (vh - ref.h * s) / 2,
  };
}

/**
 * Map a y authored against the reference stage into viewport pixels.
 *
 * Everything vertical goes through here rather than being expressed as a
 * fraction of viewport height. The two agree exactly while the scale is
 * unclamped; past the clamp, a fraction of the viewport would keep drifting
 * apart from geometry that has stopped growing, which is what opened the gap
 * between the frame and its baseline on tall displays.
 */
export function stageY(stage: Stage, authored: number): number {
  return stage.top + authored * stage.s;
}

/**
 * Seeded scatter. Must be deterministic — the design calls for the same
 * scatter on every load, not a random one.
 */
function jitter(i: number, k: number): number {
  const v = Math.sin((i + 1) * 12.9898 + k * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

function signedJitter(i: number, k: number, amplitude: number): number {
  return (jitter(i, k) * 2 - 1) * amplitude;
}

/* ------------------------------------------------------------------ *
 * Home deck
 * ------------------------------------------------------------------ */

/** Card size, derived from viewport height through the locked ratio rule. */
export function deckCardSize(stage: Stage) {
  const cfg = stage.mobile ? DECK.mobile : DECK.desktop;
  const ref = stage.mobile ? MOBILE_REF.h : DESKTOP_REF.h;
  const height = clamp(
    stage.h * (cfg.cardHeight / ref),
    cfg.cardHeightMin,
    cfg.cardHeight * SCALE.max,
  );
  const width = height * CARD_RATIO;
  return { width, height, radius: width * RADIUS_RATIO, k: height / cfg.cardHeight };
}

/**
 * How far a card swings out on its way to the back, in stage pixels.
 *
 * Derived from card width rather than being a fixed distance, so the card
 * clears the stack by the same proportion at every viewport size. Also the
 * natural unit for a throw: flinging one of these per second is one card per
 * second, which is what makes a fling feel like the same motion the scroll
 * produces rather than a separate animation bolted on.
 */
export function deckThrow(stage: Stage): number {
  const cfg = stage.mobile ? DECK.mobile : DECK.desktop;
  return deckCardSize(stage).width * cfg.arcXWidths;
}

/** Where the deck's shared origin sits, as the hero clears out of the way. */
export function deckOrigin(stage: Stage, intro: number) {
  const size = deckCardSize(stage);
  if (stage.mobile) {
    const cfg = DECK.mobile;
    const cx = stage.w * cfg.cx[0];
    const cy =
      stageY(stage, cfg.cyPx.top) +
      size.height / 2 +
      (1 - intro) * cfg.cyPx.rise * stage.s;
    return { cx, cy };
  }
  const cfg = DECK.desktop;
  return {
    cx: stage.w * lerp(cfg.cx[0], cfg.cx[1], intro),
    cy: stageY(stage, DESKTOP_REF.h * lerp(cfg.cy[0], cfg.cy[1], intro)),
  };
}

/**
 * How many places back in the stack card `i` is sitting, given deck position
 * `p`. Fractional, and wraps — a card at depth `count - 1 + f` is mid-shuffle.
 */
export function cardDepth(i: number, count: number, p: number): number {
  return (((i - p) % count) + count) % count;
}

/**
 * Shuffle phase, 0 at rest and peaking at 1 half way through a card's trip to
 * the back. Drives the pull-forward of everything still in the stack.
 */
export function shufflePulse(p: number): number {
  // sin SQUARED, not sin.
  //
  // Both are zero at every whole card, but plain sin arrives there with a
  // non-zero slope, so a spring settling around a whole number — exactly what
  // a fling does — drives the pull back and forth through that corner and the
  // stack visibly jiggles. Squaring flattens the curve at both ends, so an
  // overshoot oscillating around the target produces almost no pull at all and
  // the cards simply come to rest.
  const s = Math.sin((p - Math.floor(p)) * Math.PI);
  return s * s;
}

/**
 * Stacking order for a deck card.
 *
 * Kept separate from `deckCard` because the cards each run on a slightly
 * delayed deck position for the stagger, and stacking must not be delayed with
 * them — two cards briefly disagreeing about their depth is invisible, two
 * cards briefly disagreeing about who is in front is not. So this is always
 * asked the true, undelayed position.
 */
export function deckZ(i: number, count: number, p: number): number {
  const depth = cardDepth(i, count, p);
  const deepest = count - 1;
  if (depth >= deepest) {
    const t = 1 - (depth - deepest);
    return t < 0.5 ? 60 : 50 - deepest;
  }
  return Math.round(50 - depth);
}

/**
 * One deck card's geometry.
 *
 * `p` is fractional on purpose — the shuffle is continuous, and a card whose
 * depth passes the back of the stack swings out to the right, rotates in Y and
 * tucks in behind. That arc is the signature motion of the site.
 */
export function deckCard(
  i: number,
  count: number,
  p: number,
  intro: number,
  stage: Stage,
  reduced: boolean,
  /**
   * Which side of the stack the departing card travels around: 1 for the
   * right, -1 for the left. Scrolling always goes right, as authored; a card
   * thrown to the left goes around the left, because watching it double back
   * across the deck to exit the far side reads as the throw being ignored.
   */
  dir: 1 | -1 = 1,
  /**
   * How far through its own departure the card is, 0 at the front of the deck
   * and 1 at the back. Supplied by the layer, which runs a clock per card.
   *
   * When it is given, it replaces the position the deck would otherwise imply
   * — that is the whole point. Deriving the swing from deck position meant a
   * fast move squashed it flat; on its own clock the card always travels the
   * full arc.
   */
  clock?: number,
  /**
   * Multiplier on this card's swing. 1 when it is travelling alone; wider when
   * it is sharing the air with others and has to get around them too.
   */
  arcScale = 1,
): Geo {
  const cfg = stage.mobile ? DECK.mobile : DECK.desktop;
  const size = deckCardSize(stage);
  const { cx, cy } = deckOrigin(stage, intro);
  const k = size.k;

  const jx = reduced ? 0 : signedJitter(i, 1, cfg.jitter[0]) * k;
  const jy = reduced ? 0 : signedJitter(i, 2, cfg.jitter[1]) * k;

  /**
   * Rotation splays to alternating sides, with a seeded magnitude.
   *
   * Left to the raw seed the scatter is lopsided — it happens to give the two
   * cards you actually see -1.1 and -2.9 degrees while burying +5.7 further
   * back, so the whole deck reads as leaning one way. Forcing the sign to
   * alternate and keeping the seeded size gives a stack that sits straight on
   * and splays to both sides, which is the intended read, without going back
   * to a uniform fan.
   */
  const splay = i % 2 === 0 ? -1 : 1;
  const jr = reduced
    ? 0
    : Math.abs(signedJitter(i, 3, cfg.jitter[2])) * splay;

  const depth = cardDepth(i, count, p);
  const deepest = count - 1;

  /**
   * The stack takes up the space the departing card is vacating: every card
   * still in it eases forward by a fraction of a depth step, most at the front,
   * tapering to nothing a few cards back. Driven off the shuffle phase rather
   * than off the departing card, so it is still a pure function of `p` and
   * still scrubs backwards exactly.
   */
  const pulse = reduced ? 0 : shufflePulse(p);
  const pullAt = (d: number) => {
    const reach = Math.max(0, 1 - d / cfg.pullReach);
    return { depth: cfg.pull * pulse * reach, rot: cfg.pullRot * pulse * reach };
  };

  /**
   * Opacity of a card resting `d` places back. Flat across the front of the
   * stack, then falling away behind it.
   */
  const restScrim = (d: number) =>
    Math.min(cfg.maxScrim, Math.max(0, d - cfg.opaqueDepth) * cfg.dScrim);

  /** Resting position for a card `d` places back in the stack. */
  const rest = (d: number) => ({
    x: d * cfg.dx * k + jx * 0.4 * Math.min(1, d),
    y: d * cfg.dy * k + jy * 0.55 * Math.min(1, d),
    scale: 1 - d * cfg.dScale,
    rotate: d < 0.02 ? 0 : jr * (0.3 + 0.12 * d),
  });

  let x: number, y: number, scale: number, rotate: number;
  let rotateY = 0;
  let scrim: number, z: number;

  const departing = clock !== undefined || depth >= deepest;

  if (departing) {
    // Mid-shuffle: out to the side, over the top, down to the back.
    const t = clock !== undefined ? clock : 1 - (depth - deepest);
    const ease = smoothstep(t);
    const arc = Math.sin(t * Math.PI);
    const deep = rest(deepest);
    x = deep.x * ease + arc * size.width * cfg.arcXWidths * arcScale * dir;
    y = deep.y * ease + arc * cfg.arcY * k;
    scale = 1 + (deep.scale - 1) * ease;
    rotate = reduced ? 0 : deep.rotate * ease + arc * cfg.arcRot * dir;
    rotateY = reduced ? 0 : arc * cfg.arcRotY * dir;
    /**
     * Held fully opaque while the card is still passing in FRONT of the stack,
     * then faded over the tail of the arc as it tucks in behind.
     *
     * Fading from the start meant a half-transparent card lying over the deck
     * for the whole outward half of the trip, which reads as a rendering fault
     * rather than as depth. Lands exactly on the resting opacity of the
     * deepest slot, so there is no step when the shuffle ends.
     */
    const fade = clamp01((t - cfg.fadeStart) / (1 - cfg.fadeStart));
    scrim = lerp(0, restScrim(deepest), smoothstep(fade));
    z = t < 0.5 ? 60 : 50 - deepest;
  } else {
    const pull = pullAt(depth);
    const g = rest(Math.max(0, depth - pull.depth));
    // While the deck is still assembling out of the hero the cards carry an
    // extra lean that resolves into their resting scatter, so the intro is a
    // rotation as well as a move rather than a block sliding into place.
    const introLean = reduced ? 0 : (1 - intro) * cfg.introRot * splay;
    x = g.x;
    y = g.y;
    scale = g.scale;
    /**
     * The front card is always square to the viewer.
     *
     * It is the one being read — and once there is real footage in it, a
     * screen recording sitting at an angle is just a crooked video. Every
     * rotation the stack carries fades out as a card reaches the front, so it
     * arrives upright rather than snapping straight.
     */
    rotate = (g.rotate + pull.rot + introLean) * Math.min(1, depth);
    scrim = restScrim(depth);
    z = 50 - depth;
  }

  // The stack slides aside while a card goes round it, and returns — away
  // from whichever side the card is passing on.
  const shift = reduced ? 0 : cfg.shiftX * pulse * k * dir;

  return {
    x: cx + shift - size.width / 2 + x,
    y: cy - size.height / 2 + y,
    w: size.width,
    h: size.height,
    radius: size.radius,
    pad: 0,
    innerRadius: size.radius,
    rotate,
    rotateY,
    scale,
    // Deck cards are never transparent; depth is the wash above.
    opacity: 1,
    scrim: clamp01(scrim),
    z: Math.round(z),
  };
}

/** Which card is at the front, for the ledger and the tick row. */
export function frontIndex(p: number, count: number): number {
  return (((Math.round(p) % count) + count) % count);
}

/* ------------------------------------------------------------------ *
 * Project page
 * ------------------------------------------------------------------ */

/** Scroll height a project page needs for `shots` shots plus the return tail. */
export function caseScrollHeight(shots: number): number {
  return CASE.offset + shots * CASE.step + CASE.tail;
}

/** Progress of the return-to-deck ending, 0 until past the last shot. */
export function returnProgress(cp: number, shots: number): number {
  return clamp01((cp - (shots - 1)) / 0.85);
}

/**
 * The shared bottom edge every device shape bottoms out on.
 *
 * Authored as 689 on the 900px stage. Expressed through `stageY` so it tracks
 * the frame, which is the whole point of a shared baseline — as a raw fraction
 * of viewport height it kept sliding down a tall screen while the frame it was
 * supposed to sit under had stopped growing.
 */
export function caseBaseline(stage: Stage): number {
  return stageY(stage, DESKTOP_REF.h * CASE.baseline);
}

/**
 * The morphing device frame.
 *
 * On the intro screen it sits right of the text. From the first shot on it
 * centres and bottoms out on a fixed baseline, so portrait, square, desktop and
 * landscape frames all share one bottom edge. Past the last shot it interpolates
 * back into a deck card for the return ending.
 */
export function caseFrame(
  cp: number,
  shotKinds: ShotKind[],
  stage: Stage,
): Geo {
  const shots = shotKinds.length;
  const active = clamp(Math.round(cp), 0, shots - 1);
  const s = stage.s;
  const base = frameBox(shotKinds[active]);
  const r = returnProgress(cp, shots);
  const L = (from: number, to: number) => lerp(from, to, r);

  const card = CASE.returnCard;
  const w = (r > 0 ? L(base.w, card.w) : base.w) * s;
  const h = (r > 0 ? L(base.h, card.h) : base.h) * s;
  const pad = (r > 0 ? L(base.pad, 0) : base.pad) * s;
  const radius = (r > 0 ? L(base.r, card.r) : base.r) * s;
  const innerRadius = (r > 0 ? L(base.ir, card.r) : base.ir) * s;

  const baseline = caseBaseline(stage);
  const introScreen = cp < 0.5 && r === 0;

  let x: number, y: number;
  if (introScreen) {
    // Intro: parked at the right of the stage, beside the text column.
    x = stage.w - 200 * s - base.w * s;
    y = stageY(stage, 95);
  } else {
    x = stage.w / 2 - w / 2;
    y = r > 0 ? L(baseline - base.h * s, stageY(stage, card.top)) : baseline - h;
  }

  return {
    x,
    y,
    w,
    h,
    radius,
    pad,
    innerRadius,
    rotate: 0,
    rotateY: 0,
    scale: 1,
    opacity: 1,
    scrim: 0,
    z: 52,
  };
}

/** Does this shot want the desktop-window title bar with its three dots? */
export function frameHasBar(kind: ShotKind): boolean {
  return frameBox(kind).bar;
}

/** Ghost cards that fan out behind the frame during the return ending. */
export function ghostCards(r: number, stage: Stage) {
  const e = smoothstep(r);
  const s = stage.s;
  const card = CASE.returnCard;
  return CASE.ghosts.map((g, k) => ({
    key: k,
    w: card.w * s,
    h: card.h * s,
    radius: card.r * s,
    top: stageY(stage, card.top),
    dx: g.dx * e * s,
    dy: g.dy * e * s,
    rotate: g.rot * e,
    scale: 1 - (1 - g.scale) * e,
    opacity: clamp01((r - k * 0.11) * 3),
  }));
}

/* ------------------------------------------------------------------ *
 * Project page — mobile
 *
 * The mobile project page is a horizontal snap carousel. The axis split is
 * deliberate: vertical moves between projects, horizontal between shots.
 *
 * The first card is the shared element carried over from the home deck, so its
 * geometry is computed here from the rail's scroll position rather than laid
 * out as a flex item — that keeps it in the persistent media layer, and keeps
 * its video playing.
 * ------------------------------------------------------------------ */

/** Distance from one carousel card to the next. */
export function railPitch(stage: Stage): number {
  return (CASE.mobile.w + CASE.mobile.gap) * stage.s;
}

/** Side padding that centres the first and last cards in the rail. */
export function railPadding(stage: Stage): number {
  return (stage.w - CASE.mobile.w * stage.s) / 2;
}

/**
 * Off-centre cards tilt, pivoting from their own centre so they stay
 * vertically aligned and just sit off-kilter. Tuned down twice in the design —
 * keep it subtle.
 */
export function railCard(
  i: number,
  rp: number,
  stage: Stage,
  reduced: boolean,
): Geo {
  const m = CASE.mobile;
  const s = stage.s;
  const near = Math.min(1, Math.abs(rp - i));
  const signed = i - rp;
  const w = m.w * s;
  const h = m.h * s;

  return {
    x: railPadding(stage) + i * railPitch(stage) - rp * railPitch(stage),
    y: stageY(stage, m.top) + (reduced ? 0 : near * 8),
    w,
    h,
    radius: m.r * s,
    pad: 0,
    innerRadius: m.r * s,
    rotate: reduced
      ? 0
      : (signed > 0 ? 1 : -1) * Math.min(1, Math.abs(signed)) * 1,
    rotateY: 0,
    scale: reduced ? 1 : 1 - near * 0.035,
    // Same rule as the deck: veiled, never see-through.
    opacity: 1,
    scrim: reduced ? 0 : near * 0.3,
    z: 52,
  };
}
