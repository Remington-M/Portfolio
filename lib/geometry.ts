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
  HERO_INTRO,
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
  /**
   * Vertical scale. 1 at the reference height.
   *
   * Applies to anything whose constraint is vertical space — frame heights,
   * baselines, the caption line, vertical padding. It is NOT the scale for
   * horizontal measurements; see `sx`.
   */
  s: number;
  /**
   * Horizontal scale. 1 at the reference width.
   *
   * Margins used to ride `s`, which meant the width of the page's gutters was
   * decided by how tall the window was: the same 1440-wide window carried an
   * 84px gutter at 700 tall and a 144px one at 1200, having never changed
   * width. Horizontal room is now answerable to horizontal space.
   *
   * It cannot exceed 1, because the stage itself stops at the reference width —
   * past that the surplus becomes page margin outside the stage, which is where
   * extra width should go rather than into ever-wider gutters.
   */
  sx: number;
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
  const w = mobile ? vw : Math.min(vw, DESKTOP_REF.w);
  return {
    w,
    h: vh,
    mobile,
    s,
    sx: clamp(w / ref.w, min, 1),
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
 * Fan angle for a card `depth` places back, in degrees.
 *
 * Derived from the deck's own size rather than read from a list, so both ends
 * are square whatever the deck holds: the front card because it is the one
 * being looked at, and the deepest because the arc that carries a card to the
 * back has no fan of its own — anything else and every dealt card snaps into
 * its fan angle the instant it stops travelling.
 *
 * In between, cards splay to alternating sides, further the deeper they sit,
 * with the outermost pair reaching `spread`. Depth is fractional while the
 * deck moves, so the angle is read between the two nearest whole steps rather
 * than snapped to one — a card settling into the front slot turns smoothly
 * upright instead of flicking there.
 */
function fanAngle(depth: number, deepest: number, spread: number): number {
  const at = (d: number) => {
    if (deepest < 1 || d <= 0) return 0;
    /**
     * Cards step outward from the front, alternating sides.
     *
     * The front card is square because it is the one being read, so it has to
     * sit in the MIDDLE of the fan — and the only way to reach the middle from
     * one end of a depth order is to alternate. Laid out in depth order left
     * to right instead, the square card lands between the two innermost cards
     * and halves their gaps: five cards came out at 14.7, 7.3, 7.3, 14.7
     * degrees apart. Alternating, every gap is the same gap.
     *
     * The deepest card is fanned like the rest. Squaring it as well as the
     * front one was what an earlier version did to stop a dealt card snapping
     * as it landed, and it cost the fan a position — the shuffle that carries
     * a card to the back now lands it on its fan angle instead.
     */
    const pairs = Math.max(1, Math.ceil(deepest / 2));
    const side = d % 2 === 1 ? -1 : 1;
    return (side * Math.ceil(d / 2) * spread) / pairs;
  };
  const lo = Math.floor(depth);
  return lerp(at(lo), at(lo + 1), depth - lo);
}

/**
 * One deck card's geometry.
 *
 * `p` is fractional on purpose — the shuffle is continuous, and a card whose
 * depth passes the back of the stack swings out to the right, rotates in Y and
 * tucks in behind. That arc is the signature motion of the site.
 */
/** Cubic ease-out, for a rise that lands softly. */
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

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
  /**
   * How far the landing deck has been dealt in, 0–1. Below 1 the cards sit
   * under the stage and the fan is closed; see HERO_INTRO.deal.
   */
  deal = 1,
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
   * Opacity of the wash on a card resting `d` places back.
   *
   * A straight ramp from the front card to the last, rather than a fixed step
   * per place: it used to be flat across the front three and then drop away
   * in two jumps, which read as a couple of dark cards stuck behind a slab of
   * identical ones rather than as a stack receding.
   *
   * Measured against the deepest card rather than counted outwards, so the
   * back of the stack is always the darkest thing in it whatever the deck
   * holds. Add a project and the ramp spreads to cover it; the last card is
   * still the last card.
   */
  const restScrim = (d: number) =>
    cfg.maxScrim * clamp01(d / Math.max(1, deepest));

  /**
   * The lean the stack carries, alternating sides down it. Set to zero in
   * DECK today: the landing screen is a fan, and a lean at the deck only
   * splayed the stack you browse. Kept as a term so it can be tuned back in.
   */
  const lean = reduced ? 0 : cfg.lean * splay;

  /**
   * How much of the stack's own scatter is showing: none on the landing
   * screen, all of it once the deck has assembled.
   *
   * The fan and the scatter are two different accounts of how the stack is
   * arranged, and running both at once gave neither. The fan turns every card
   * about one pivot by an even step; the scatter steps each card up and to the
   * right by its depth, leans it five degrees by turn, and jitters the result.
   * Together the leans cancelled two cards onto the same angle, and the depth
   * steps pushed the deeper half of the fan sideways — the gaps came out 38,
   * 48, 69 and 68 pixels across an arc whose angles were exactly even.
   *
   * They cross-fade instead. Fanned, the cards share a pivot and nothing but
   * the fan places them, which is what a hand of cards is. Assembled, the
   * stack has its offsets and its lean back, exactly as before.
   */
  const scatter = intro;

  /**
   * Resting position for a card `d` places back in the stack.
   *
   * The lean lives in here rather than being added at the one place a resting
   * card is drawn. A card on its way to the back reads its landing rotation
   * from this too, so leaving the lean out of it would have every shuffle
   * finish a few degrees short and then drift the rest of the way once the
   * card was counted as resting.
   */
  const rest = (d: number) => ({
    x: (d * cfg.dx * k + jx * 0.4 * Math.min(1, d)) * scatter,
    y: (d * cfg.dy * k + jy * 0.55 * Math.min(1, d)) * scatter,
    scale: 1 - d * cfg.dScale,
    rotate: d < 0.02 ? 0 : (jr * (0.3 + 0.12 * d) + lean) * scatter,
  });

  /**
   * The whole stack, larger before the deck assembles.
   *
   * Applied to every card so the stack grows as one object rather than the
   * front card growing out of it, and multiplied into `scale` rather than into
   * the size so nothing downstream has to know: the throw distance, the depth
   * offsets and the arc all stay authored against one card size, and the
   * transform grows the result about the card's own centre.
   *
   * Not disabled under reduced motion, unlike the jitter and the arc. This is
   * scroll-linked, exactly like the `cx`/`cy` it moves with — it is the size
   * the landing state IS, not an animation played on the way to it. Dropping
   * it while the lowered origin stayed would leave a small stack pushed down
   * off the bottom of the page, which is not a calmer version of the design,
   * just a broken one.
   */
  const heroGrow = stage.mobile
    ? 1
    : lerp(DECK.desktop.heroScale[0], DECK.desktop.heroScale[1], intro);

  /**
   * Where the fan puts a card `d` places back: its angle, and the offset that
   * comes of turning it about a pivot below the stack.
   *
   * Turning about a point that far below is what sets the cards side by side
   * rather than merely leaning them — the further round a card turns the more
   * it also carries sideways and lifts. Folds to nothing as the intro plays,
   * so the fan, the shrink and the travel to the right are one scroll and
   * scrubbing back up re-fans exactly.
   */
  /**
   * The deal: cards rise from below the stage as one stack, and the fan
   * opens over the back half of the rise so they arrive and then sprawl.
   */
  const dealRise = 1 - easeOut(clamp01(deal / 0.85));
  const dealSpread = smoothstep(
    clamp01((deal - HERO_INTRO.deal.spreadFrom) / (1 - HERO_INTRO.deal.spreadFrom)),
  );
  const fanAt = (d: number) => {
    const deg = reduced
      ? 0
      : fanAngle(d, deepest, cfg.fan.spread) * (1 - intro) * dealSpread;
    const rad = (deg * Math.PI) / 180;
    const pivot = cfg.fan.pivot * k;
    return { deg, dx: pivot * Math.sin(rad), dy: pivot * (1 - Math.cos(rad)) };
  };

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
    /**
     * The slot at the back is a fanned slot, so the arc has to land on it.
     *
     * This carried no fan at all, which forced the deepest card's fan angle to
     * be zero — the only value that let a dealt card stop without a step. Every
     * other value snapped: a card arrived square and then turned the moment it
     * counted as resting rather than travelling. Folding the landing angle into
     * the arc frees the back of the fan to be wherever the spread wants it.
     */
    const f = fanAt(deepest);
    x = (deep.x + f.dx) * ease + arc * size.width * cfg.arcXWidths * arcScale * dir;
    y = (deep.y + f.dy) * ease + arc * cfg.arcY * k;
    scale = 1 + (deep.scale - 1) * ease;
    rotate = reduced ? 0 : (deep.rotate + f.deg) * ease + arc * cfg.arcRot * dir;
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
    const f = fanAt(depth);
    const fan = f.deg;
    x = g.x + f.dx;
    y = g.y + f.dy;
    scale = g.scale;
    /**
     * The front card is always square to the viewer.
     *
     * It is the one being read — and once there is real footage in it, a
     * screen recording sitting at an angle is just a crooked video. Every
     * rotation the stack carries fades out as a card reaches the front, so it
     * arrives upright rather than snapping straight.
     */
    rotate = (g.rotate + pull.rot) * Math.min(1, depth) + fan;
    scrim = restScrim(depth);
    z = 50 - depth;
  }

  // The stack slides aside while a card goes round it, and returns — away
  // from whichever side the card is passing on.
  const shift = reduced ? 0 : cfg.shiftX * pulse * k * dir;

  return {
    x: cx + shift - size.width / 2 + x,
    y:
      cy -
      size.height / 2 +
      y +
      dealRise * size.height * HERO_INTRO.deal.riseHeights,
    w: size.width,
    h: size.height,
    radius: size.radius,
    pad: 0,
    innerRadius: size.radius,
    rotate,
    rotateY,
    scale: scale * heroGrow,
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
  return clamp01((cp - (shots - 1)) / CASE.returnSpan);
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
/** A shot's shape: the sort of frame it wants, and its true proportions. */
export type ShotShape = { kind: ShotKind; aspect?: number };

export function caseFrame(
  cp: number,
  shapes: ShotShape[],
  stage: Stage,
  /**
   * Stop the viewer taking its shape from the clip.
   *
   * One box for every shot, so nothing about the frame changes as the sequence
   * is stepped and the push is left carrying the whole transition on its own.
   * Clips are contained inside it rather than filling it, which is the trade:
   * no resize, but a portrait recording sits in a wide window with the device
   * surface either side of it.
   *
   * The intro is exempt. It is a phone standing beside a column of type, and
   * the card that flew in from the deck to become it is phone-shaped — turning
   * that into a landscape window would break the arrival, not the sequence.
   */
  fixed = false,
): Geo {
  const shots = shapes.length;
  const active = clamp(Math.round(cp), 0, shots - 1);
  const s = stage.s;
  const introScreen0 = cp < 0.5 && returnProgress(cp, shots) === 0;
  const base =
    fixed && !introScreen0
      ? frameBox("desktop")
      : frameBox(shapes[active].kind, shapes[active].aspect);
  const r = returnProgress(cp, shots);
  const L = (from: number, to: number) => lerp(from, to, r);

  const card = CASE.returnCard;

  /**
   * The frame is contained inside the room it has, on both axes at once.
   *
   * The authored sizes are generous on purpose, so the limit lives here:
   * whatever comes out of `frameBox` is scaled down, keeping its proportions,
   * until it sits inside the stage. That way the sizes can be chosen for how
   * they read rather than for the narrowest window they must survive.
   *
   * One `min` over both budgets rather than a width clamp bolted onto a
   * height-derived size. With only the width term, the governing dimension
   * SWITCHED as a window resized — height decided the frame until the width
   * term abruptly took over — and nothing at all stopped a frame growing down
   * through the caption. Asking both questions every time means neither one
   * takes over: whichever is tighter simply binds, and it changes smoothly.
   *
   * Still capped at 1. This shrinks to fit and never grows: `s` is what makes
   * the frame bigger on a bigger stage, and the authored sizes are chosen for
   * how they read rather than to be filled out.
   */
  const roomW = Math.max(1, stage.w - CASE.gutter * 2 * stage.sx);
  const roomH = Math.max(1, CASE.roomH * s);
  const fit = Math.min(1, roomW / (base.w * s), roomH / (base.h * s));

  const w = (r > 0 ? L(base.w * fit, card.w) : base.w * fit) * s;
  const h = (r > 0 ? L(base.h * fit, card.h) : base.h * fit) * s;
  const pad = (r > 0 ? L(base.pad, 0) : base.pad) * s;
  const radius = (r > 0 ? L(base.r, card.r) : base.r) * s;
  const innerRadius = (r > 0 ? L(base.ir, card.r) : base.ir) * s;

  const baseline = caseBaseline(stage);
  const introScreen = introScreen0;

  let x: number, y: number;
  if (introScreen) {
    // Intro: parked at the right of the stage, beside the text column, on
    // the same margin the type column keeps on the left.
    x =
      stage.w -
      CASE.intro.frameRight * stage.sx -
      base.h * s * (base.w / base.h) * fit;
    y = stageY(stage, 95);
  } else {
    x = stage.w / 2 - w / 2;
    /**
     * Centred, not sat on a baseline. The viewer is one player changing shape
     * between clips, and that reads as a single object growing and shrinking
     * only if it changes around a fixed middle — pin the bottom edge instead
     * and the top jumps, which reads as two different players being swapped.
     */
    const centre = stageY(stage, DESKTOP_REF.h * CASE.centreY);
    y = r > 0 ? L(centre - (base.h * fit * s) / 2, stageY(stage, card.top)) : centre - h / 2;
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

/** Where the shot title and its meta line sit, clear of the largest frame. */
export function caseCaption(stage: Stage): number {
  /**
   * Derived from where the viewer actually ends, not authored beside it.
   *
   * The frame is centred on `centreY` and may be `roomH` tall, so its lowest
   * possible edge is a fixed distance below that line — and the caption is
   * `captionGap` below THAT. Written as its own fraction of the stage the two
   * drifted: whatever `roomH` became, the caption stayed where it was.
   */
  const bottom = DESKTOP_REF.h * CASE.centreY + CASE.roomH / 2;
  return stageY(stage, bottom + CASE.captionGap);
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
