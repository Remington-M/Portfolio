import {
  CARD_RATIO,
  RADIUS_RATIO,
  DECK,
  CASE,
  DESKTOP_REF,
  MOBILE_REF,
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
  z: number;
};

export type Stage = {
  /** Stage box — the centred 1440-max band on desktop, the viewport on mobile. */
  w: number;
  h: number;
  mobile: boolean;
  /** Uniform scale applied to authored vertical geometry on short viewports. */
  s: number;
};

export function makeStage(vw: number, vh: number, mobile: boolean): Stage {
  if (mobile) {
    return { w: vw, h: vh, mobile, s: clamp(vh / MOBILE_REF.h, 0.72, 1) };
  }
  return {
    w: Math.min(vw, DESKTOP_REF.w),
    h: vh,
    mobile,
    s: clamp(vh / DESKTOP_REF.h, 0.68, 1),
  };
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
    cfg.cardHeight,
  );
  const width = height * CARD_RATIO;
  return { width, height, radius: width * RADIUS_RATIO, k: height / cfg.cardHeight };
}

/** Where the deck's shared origin sits, as the hero clears out of the way. */
export function deckOrigin(stage: Stage, intro: number) {
  const size = deckCardSize(stage);
  if (stage.mobile) {
    const cfg = DECK.mobile;
    const cx = stage.w * cfg.cx[0];
    const cy =
      cfg.cyPx.top * stage.s +
      size.height / 2 +
      (1 - intro) * cfg.cyPx.rise * stage.s;
    return { cx, cy };
  }
  const cfg = DECK.desktop;
  return {
    cx: stage.w * lerp(cfg.cx[0], cfg.cx[1], intro),
    cy: stage.h * lerp(cfg.cy[0], cfg.cy[1], intro),
  };
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
): Geo {
  const cfg = stage.mobile ? DECK.mobile : DECK.desktop;
  const size = deckCardSize(stage);
  const { cx, cy } = deckOrigin(stage, intro);
  const k = size.k;

  const jx = reduced ? 0 : signedJitter(i, 1, cfg.jitter[0]) * k;
  const jy = reduced ? 0 : signedJitter(i, 2, cfg.jitter[1]) * k;
  const jr = reduced ? 0 : signedJitter(i, 3, cfg.jitter[2]);

  const depth = (((i - p) % count) + count) % count;
  const deepest = count - 1;

  /** Resting position for a card `d` places back in the stack. */
  const rest = (d: number) => ({
    x: d * cfg.dx * k + jx * 0.4 * Math.min(1, d),
    y: d * cfg.dy * k + jy * 0.55 * Math.min(1, d),
    scale: 1 - d * cfg.dScale,
    rotate: d < 0.02 ? 0 : jr * (0.3 + 0.12 * d),
  });

  let x: number, y: number, scale: number, rotate: number;
  let rotateY = 0;
  let opacity: number, z: number;

  if (depth >= deepest) {
    // Mid-shuffle: out to the right, over the top, down to the back.
    const t = 1 - (depth - deepest);
    const ease = smoothstep(t);
    const arc = Math.sin(t * Math.PI);
    const deep = rest(deepest);
    x = deep.x * ease + arc * cfg.arcX * k;
    y = deep.y * ease + arc * cfg.arcY * k;
    scale = 1 + (deep.scale - 1) * ease;
    rotate = reduced ? 0 : deep.rotate * ease + arc * cfg.arcRot;
    rotateY = reduced ? 0 : arc * cfg.arcRotY;
    opacity = 1 - 0.78 * ease;
    z = t < 0.5 ? 60 : 50 - deepest;
  } else {
    const g = rest(depth);
    x = g.x;
    y = g.y;
    scale = g.scale;
    rotate = g.rotate;
    opacity = Math.max(0.24, 1 - depth * cfg.dOpacity);
    z = 50 - depth;
  }

  return {
    x: cx - size.width / 2 + x,
    y: cy - size.height / 2 + y,
    w: size.width,
    h: size.height,
    radius: size.radius,
    pad: 0,
    innerRadius: size.radius,
    rotate,
    rotateY,
    scale,
    opacity: Math.max(0, opacity),
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

  const baseline = stage.h * CASE.baseline;
  const introScreen = cp < 0.5 && r === 0;

  let x: number, y: number;
  if (introScreen) {
    // Intro: parked at the right of the stage, beside the text column.
    x = stage.w - 200 * s - base.w * s;
    y = 95 * s;
  } else {
    x = stage.w / 2 - w / 2;
    y = r > 0 ? L(baseline - base.h * s, card.top * s) : baseline - h;
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
    top: card.top * s,
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
    y: m.top * s + (reduced ? 0 : near * 8),
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
    opacity: 1 - near * 0.24,
    z: 52,
  };
}
