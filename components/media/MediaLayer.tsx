"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  motion,
  motionValue,
  useAnimationFrame,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  type MotionValue,
} from "motion/react";
import Link from "next/link";
import { useStage } from "./stage";
import { openingIndex, projects, stripeFill, type Shot } from "@/lib/projects";
import { asset, media, poster } from "@/lib/asset";
import { playWhenReady, preloadFor } from "@/lib/playback";
import {
  CASE,
  SHADOW,
  SPRING,
  DECK,
  DECK_LIVE,
  DECK_MOTION,
  DRAG,
  TIDY,
  deckShadow,
} from "@/lib/design";
import {
  cardDepth,
  caseFrame,
  deckCard,
  deckCardSize,
  deckThrow,
  frontIndex,
  type Geo,
} from "@/lib/geometry";
import { derived as tuned, subscribeTuning, tuning } from "@/lib/tuning";
import { heroLight, heroTune } from "@/lib/heroTuning";
import {
  clamp,
  clamp01,
  cubicBezier,
  lerp,
  spring,
  snapSpring,
  springConfig,
  stepSpring,
  REST,
  type Spring,
  type SpringConfig,
} from "@/lib/spring";

/**
 * The persistent media layer.
 *
 * This component mounts once, in the root layout, and never unmounts. Route
 * changes swap the page beneath it; the cards — and crucially the <video>
 * elements inside them — are the same DOM nodes throughout. That is the whole
 * point: a video keeps playing across a navigation because nothing ever tears
 * it down and rebuilds it. Decode state, currentTime and buffering all survive.
 *
 * Geometry is computed rather than measured. The handoff's motion is authored as
 * pure functions of scroll position specifically so that scrubbing backwards
 * reverses it exactly, and a spring chasing a CSS-transitioned element would
 * lose that. So the layer owns the maths and writes transforms directly.
 */

/**
 * A short rolling history of the deck position.
 *
 * The stagger works by letting each card read where the deck was a few
 * milliseconds ago instead of where it is now. Keeping a real time-stamped
 * history rather than a fixed per-frame lag is what makes it frame-rate
 * independent — a one-frame delay is twice as long at 60fps as at 120, so the
 * stagger would silently change character with the display.
 */
const HISTORY = 96;

class DeckHistory {
  private t = new Float64Array(HISTORY);
  private v = new Float64Array(HISTORY);
  private head = -1;
  private filled = 0;

  push(time: number, value: number): void {
    this.head = (this.head + 1) % HISTORY;
    this.t[this.head] = time;
    this.v[this.head] = value;
    if (this.filled < HISTORY) this.filled++;
  }

  /** Deck position at `time`, interpolated. Clamps at both ends. */
  at(time: number): number {
    if (this.filled === 0) return 0;
    let newer = this.head;
    for (let k = 0; k < this.filled; k++) {
      const idx = (this.head - k + HISTORY) % HISTORY;
      if (this.t[idx] <= time) {
        if (k === 0) return this.v[idx];
        const span = this.t[newer] - this.t[idx];
        const f = span > 0 ? (time - this.t[idx]) / span : 0;
        return this.v[idx] + (this.v[newer] - this.v[idx]) * f;
      }
      newer = idx;
    }
    return this.v[(this.head - (this.filled - 1) + HISTORY) % HISTORY];
  }
}

type CardSprings = {
  x: Spring;
  y: Spring;
  w: Spring;
  h: Spring;
  radius: Spring;
  pad: Spring;
  innerRadius: Spring;
  rotate: Spring;
  rotateY: Spring;
  scale: Spring;
  opacity: Spring;
  scrim: Spring;
};

type CardValues = {
  x: MotionValue<number>;
  y: MotionValue<number>;
  w: MotionValue<number>;
  h: MotionValue<number>;
  radius: MotionValue<number>;
  pad: MotionValue<number>;
  innerRadius: MotionValue<number>;
  rotate: MotionValue<number>;
  rotateY: MotionValue<number>;
  scale: MotionValue<number>;
  opacity: MotionValue<number>;
  scrim: MotionValue<number>;
  z: MotionValue<number>;
  /**
   * Driven per frame rather than picked in the render, so the shadow can fade
   * out under the stack as it tidies itself away. See `TIDY.shadowGoneAt`.
   */
  shadow: MotionValue<string>;
};

const FIELDS = [
  "x",
  "y",
  "w",
  "h",
  "radius",
  "pad",
  "innerRadius",
  "rotate",
  "rotateY",
  "scale",
  "opacity",
  "scrim",
] as const;

/**
 * Half the width a card actually occupies on screen, accounting for its
 * rotation and scale.
 *
 * A rotated rectangle reaches further sideways than its width: at the sizes
 * here a few degrees of lean adds about 30px per side, because the card is
 * more than twice as tall as it is wide and the height leaks into the
 * horizontal extent. Comparing raw translate values instead had the stack
 * ending 33px short of where it visibly ended, so a card was cleared to drop
 * behind while it was still over the corner of the one beneath it.
 */
function halfExtent(s: CardSprings): number {
  const rad = (s.rotate.value * Math.PI) / 180;
  const c = Math.abs(Math.cos(rad));
  const sn = Math.abs(Math.sin(rad));
  /**
   * Measured from the UNSCALED box on purpose.
   *
   * The cards also carry a rotateY under a perspective, and the near edge of a
   * card turned away from the viewer projects wider than a flat calculation
   * expects — enough to cancel the shrink from `scale` almost exactly. Checked
   * against the browser's own box at the moment a card drops behind: the
   * unscaled figure came out at 197.9px against the browser's 197.9px, while
   * including scale gave 177.9px and cleared the card to drop behind while it
   * was still 16px over the one beneath it.
   *
   * Since scale here is never above 1, ignoring it also errs the safe way: the
   * card is treated as slightly larger than it is, so the flip happens a shade
   * late rather than early.
   */
  return (s.w.value * c + s.h.value * sn) / 2;
}

/** Centre of a card on the x axis, which is what the extent is measured from. */
function centreX(s: CardSprings): number {
  return s.x.value + s.w.value / 2;
}

function makeSprings(): CardSprings {
  return {
    x: spring(),
    y: spring(),
    w: spring(),
    h: spring(),
    radius: spring(),
    pad: spring(),
    innerRadius: spring(),
    rotate: spring(),
    rotateY: spring(),
    scale: spring(1),
    opacity: spring(0),
    scrim: spring(0),
  };
}

function makeValues(): CardValues {
  return {
    x: motionValue(0),
    y: motionValue(0),
    w: motionValue(0),
    h: motionValue(0),
    radius: motionValue(0),
    pad: motionValue(0),
    innerRadius: motionValue(0),
    rotate: motionValue(0),
    rotateY: motionValue(0),
    scale: motionValue(1),
    opacity: motionValue(0),
    scrim: motionValue(0),
    z: motionValue(0),
    shadow: motionValue(SHADOW.cardBack),
  };
}

/**
 * Where a card goes when it isn't the one being opened.
 *
 * Not away — in. It squares up on the box the opened card is going TO: same
 * place, same size, no lean, no scatter.
 *
 * Going to, not leaving from. It converged on the deck's own origin at first,
 * which is where the opened card WAS — so the stack tidied itself into a neat
 * pile back at the home page's deck position, at the deck's card size, while
 * the card it was meant to be stacking behind had already flown off to the
 * project page and become a different shape. Nothing lined up, because the two
 * were aiming at different places. Six cards resolving onto one line
 * reads as the stack tidying itself into a single clean card behind the viewer,
 * and it moves everything TOWARD the card the eye is following rather than
 * throwing five of them off the bottom of the screen away from it.
 *
 * The count of objects still goes from six to one, which is half of what
 * signals the navigation. It just resolves now instead of scattering.
 *
 * Leaving the page is the one place a card really does fade out, and its shadow
 * goes ahead of it — see `TIDY.shadowGoneAt`.
 */
function tidied(geo: Geo, to: Geo, reduced: boolean): Geo {
  if (reduced) return { ...geo, opacity: 0 };
  return {
    // Position AND size — the whole box the viewer is going to occupy.
    ...to,
    rotate: 0,
    rotateY: 0,
    scale: 1,
    opacity: 0,
    // Its own wash, and its own place in the stack. The one thing it must not
    // take from the viewer is the viewer's z, or it would land in front of it.
    scrim: geo.scrim,
    z: geo.z,
  };
}

export default function MediaLayer() {
  const {
    p,
    pTarget,
    pi,
    deal,
    viewer,
    cp,
    selected,
    mode,
    stage,
    transitionKey,
    deckDriven,
    commitDeck,
    registerRebase,
  } = useStage();
  const reduced = useReducedMotion() ?? false;

  const springs = useRef(projects.map(makeSprings));
  const values = useRef(projects.map(makeValues));
  const primed = useRef(false);
  const settling = useRef(false);
  const history = useRef(new DeckHistory());
  /** The same trick applied to the intro, so the deck assembles card by card. */
  const introHistory = useRef(new DeckHistory());

  /**
   * A held card chases the pointer on its own much stiffer spring. A grabbed
   * object should feel attached to the hand rather than elastic — but it stays
   * a spring, not a hard follow, so that releasing mid-throw hands its real
   * momentum straight to the fling.
   */
  const follow = useMemo(
    () => springConfig(DRAG.followStiffness, DRAG.followRatio),
    [],
  );

  /**
   * The live gesture. Refs throughout: a drag writes on every pointer event,
   * and routing that through React state would re-render the whole layer
   * dozens of times a second for values only the frame loop reads.
   */
  const gesture = useRef({
    pointerId: -1,
    index: -1,
    grabbed: false,
    startX: 0,
    startY: 0,
    dx: 0,
    dy: 0,
    travel: 0,
    timer: null as ReturnType<typeof setTimeout> | null,
    samples: [] as { t: number; x: number }[],
    /** Deck position when the card was grabbed; the drag is measured from it. */
    grabP: 0,
    /** Set the moment a press becomes a drag, so the release isn't a click. */
    suppressClick: false,
    /** Held so the capture can be taken late — see `grab`. */
    el: null as HTMLElement | null,
    /**
     * A finger rather than a mouse. A finger gets direct manipulation: the
     * card sits under it and goes exactly as far as it does, and only a
     * flick on release sends it round the arc. See DRAG.
     */
    touch: false,
  });

  /**
   * Whether each card has actually got behind the stack yet.
   *
   * Depth says when a card SHOULD be behind, but depth is computed from the
   * scroll position while the card's position is a spring chasing it, and
   * z-index is not something a spring can lag. So the two disagree exactly
   * when it matters: geometry says "you have cleared the stack, drop behind
   * it" while the card is still rendered on top of it, and it visibly punches
   * through. This latch holds the card in front until where it really is has
   * cleared, and keeps it behind once it has, so tucking back in reads right.
   */
  const behind = useRef(projects.map(() => false));

  /**
   * Each card's own departure clock: 0 at the front of the deck, 1 at the
   * back, and its own spring driving it between the two.
   *
   * A card leaving the deck plays the whole arc on this rather than on how far
   * the deck has moved. Tied to the deck, a quick move squashed the swing flat
   * — the card never reached full extent, never got out past the others, and
   * cut through them instead of round them. Off its own clock the trip is the
   * same shape every time, and several cards can be part way through their own
   * at once without interfering.
   */
  const arcClock = useRef(projects.map(() => spring(0)));
  /**
   * Each card's own rise on the deal. The stage's `deal` value is the
   * front card's spring and says whether the deal is on; these follow it
   * up, each a little softer than the one in front (HERO_INTRO.deal.falloff),
   * so the stack rises from the front back rather than as one block.
   */
  const dealClock = useRef(projects.map(() => spring(0)));
  const dealSeen = useRef(false);
  /** Each card's fan, opening on its own spring a beat after the rise. */
  const fanClock = useRef(projects.map(() => spring(0)));
  /** When the deal began, on the frame clock in seconds; -1 while it is
   *  not running. */
  const dealBegan = useRef(-1);
  /** Whether that clock is running — latched, so it always finishes. */
  const arcOn = useRef(projects.map(() => false));

  /** Where the current move started, so the overshoot can be clamped to it. */
  const travelFrom = useRef(0);
  const lastGoal = useRef(0);
  /** Which way the deck is going overall on the current move: 1 or -1. */
  const travelDir = useRef(1);
  /** Which side of the stack the current departure travels around. */
  const arcDir = useRef<1 | -1>(1);
  /**
   * Held while a throw is in flight, so the side it was thrown to survives
   * the release.
   *
   * Committing a throw changes the goal, and a goal change is otherwise taken
   * to mean a scroll, which always goes right. So a card thrown left flipped
   * to the right arc the instant the finger came off it — it crossed back over
   * the stack mid-flight. Invisible on a right throw, because there the reset
   * happened to agree.
   */
  const arcLocked = useRef(false);
  /**
   * Right edge of the resting stack, measured from where the cards actually
   * are rather than predicted from the depth offsets.
   *
   * Predicting it got this wrong: the formula left out the seeded jitter, so
   * the threshold sat about 11px past the real edge — just beyond the furthest
   * point the card ever reached. The clearance test could then never pass, and
   * the end-of-arc fallback did the flip instead, half way through the tuck.
   * Carried over from the previous frame, which is invisible at these speeds.
   */
  const stackRight = useRef(0);
  /** The display's pixel grid, so laid-out values can be snapped to it. */
  const dprRef = useRef(1);
  useEffect(() => {
    const read = () => {
      dprRef.current = window.devicePixelRatio || 1;
    };
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);
  /** The same edge on the left, for a card thrown that way. */
  const stackLeft = useRef(0);
  /** Scratch for the second pass, allocated once rather than per frame. */
  const scratch = useRef({
    targetX: new Float64Array(projects.length),
    dragging: new Array<boolean>(projects.length).fill(false),
    /** The card's own arc position, or -1 when it is not departing. */
    clock: new Float64Array(projects.length).fill(-1),
    /** Depth each card is headed for, which orders the ones in the air. */
    dest: new Float64Array(projects.length),
    /** How wide each card's swing is relative to travelling alone. */
    arcScale: new Float64Array(projects.length).fill(1),
    /** Which side of the stack each card is going round this frame. */
    side: new Float64Array(projects.length).fill(1),
  });
  // Seeded to match `p` and `pTarget`, so the first frame is already there.
  const deckSpring = useRef(spring(openingIndex()));

  const grab = useCallback(() => {
    const g = gesture.current;
    if (g.grabbed || g.index < 0) return;
    g.grabbed = true;
    g.suppressClick = true;
    g.grabP = pTarget.get();
    setDragIndex(g.index);
    /**
     * Capture is taken here rather than on pointerdown.
     *
     * Capturing retargets the pointer events to this element, and the click
     * that follows is dispatched to the common ancestor of the down and up
     * targets — which, once captured, is the card rather than the link inside
     * it. Capturing on every press therefore swallows the navigation on a
     * plain click. Taking it only once the press has actually become a drag
     * keeps the click intact and still guarantees a fast throw that leaves the
     * card behind is followed to the end.
     */
    if (g.el && g.pointerId >= 0) {
      try {
        g.el.setPointerCapture(g.pointerId);
      } catch {
        // Pointer already gone; the gesture ends on its own.
      }
    }
    // The gesture owns the deck from here until it settles.
    deckDriven.current = true;
  }, [deckDriven, pTarget]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent, i: number) => {
      if (mode !== "home") return;
      // Left button and touch/pen only; a right-click is a context menu.
      if (e.button !== 0) return;
      const g = gesture.current;
      if (g.timer) clearTimeout(g.timer);
      g.pointerId = e.pointerId;
      g.index = i;
      g.touch = e.pointerType === "touch";
      g.grabbed = false;
      g.startX = e.clientX;
      g.startY = e.clientY;
      g.dx = 0;
      g.dy = 0;
      g.travel = 0;
      g.samples = [{ t: performance.now(), x: e.clientX }];
      g.suppressClick = false;
      g.el = e.currentTarget as HTMLElement;
      g.timer =
        e.pointerType === "touch" && !DRAG.touchLongPress
          ? null
          : setTimeout(grab, DRAG.longPress);
    },
    [mode, grab],
  );

  /** Drop a press that turned out to be a scroll. The page has it now. */
  const abandon = useCallback(() => {
    const g = gesture.current;
    if (g.timer) clearTimeout(g.timer);
    g.timer = null;
    g.el = null;
    g.index = -1;
    g.pointerId = -1;
    g.grabbed = false;
    // Not a click either, should the browser send one anyway.
    g.suppressClick = true;
    g.dx = 0;
    g.dy = 0;
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const g = gesture.current;
      if (g.index < 0 || e.pointerId !== g.pointerId) return;
      g.dx = e.clientX - g.startX;
      g.dy = e.clientY - g.startY;
      g.travel = Math.max(g.travel, Math.hypot(g.dx, g.dy));
      g.samples.push({ t: performance.now(), x: e.clientX });
      if (g.samples.length > DRAG.velocitySamples) g.samples.shift();
      // Travelling far enough is its own grab: waiting out the long press
      // after the pointer has obviously started dragging feels broken.
      if (!g.grabbed && g.travel > DRAG.moveThreshold) {
        // Mostly vertical: a scroll, not a throw. Let it go.
        if (Math.abs(g.dy) > Math.abs(g.dx) && Math.abs(g.dy) > DRAG.scrollThreshold) {
          abandon();
          return;
        }
        if (g.timer) clearTimeout(g.timer);
        g.timer = null;
        grab();
      }
    },
    [grab, abandon],
  );

  const endGesture = useCallback(
    (e: React.PointerEvent, cancelled: boolean) => {
      const g = gesture.current;
      if (g.index < 0 || e.pointerId !== g.pointerId) return;
      if (g.timer) clearTimeout(g.timer);
      g.timer = null;

      const wasGrabbed = g.grabbed;
      const dx = g.dx;

      // Average over the last few samples — one jittery frame at the moment of
      // release should not be able to throw a card on its own.
      let vx = 0;
      if (g.samples.length >= 2) {
        const first = g.samples[0];
        const last = g.samples[g.samples.length - 1];
        const dt = (last.t - first.t) / 1000;
        if (dt > 0) vx = (last.x - first.x) / dt;
      }

      if (g.el && g.grabbed && g.el.hasPointerCapture?.(g.pointerId)) {
        try {
          g.el.releasePointerCapture(g.pointerId);
        } catch {
          // Already released with the pointer.
        }
      }
      g.el = null;
      setDragIndex(-1);
      g.index = -1;
      g.pointerId = -1;
      g.grabbed = false;
      g.dx = 0;
      g.dy = 0;

      if (!wasGrabbed) {
        // Never became a drag. A short press is a click and must navigate.
        if (g.travel < DRAG.clickSlop && !cancelled) g.suppressClick = false;
        deckDriven.current = false;
        return;
      }

      /**
       * Committed either by speed or by how far round the arc the drag got.
       * Distance is judged in deck units rather than pixels so it means the
       * same thing on a phone and on a wide display, and so it lines up with
       * the threshold a scroll has to cross.
       */
      const span = Math.max(1, deckThrow(stage));
      const progress = Math.abs(dx) / span;
      /**
       * A cancel is judged as a release, not as an undo.
       *
       * On a phone the browser cancels the pointer when it decides a touch is
       * a scroll after all — a soft, curving swipe drifts vertically enough
       * to be claimed part way round the arc. Treated as "never thrown", the
       * card, already behind the stack, retraced through it to the front.
       * The hand had let go of a moving card; where it was and how fast it
       * was going decide, the same as a release.
       */
      const touch = e.pointerType === "touch";
      const flung = touch
        ? Math.abs(vx) > DRAG.flingVelocityTouch && progress >= DRAG.flingTravelTouch
        : Math.abs(vx) > DRAG.flingVelocity;
      const thrown = flung || progress >= DECK_MOTION.commit;

      if (!thrown) {
        // Not enough to send it back. The card retraces the arc it came out
        // on, so the side is held until it has settled home.
        arcLocked.current = true;
        deckDriven.current = false;
        return;
      }

      const n = projects.length;
      const current = pTarget.get();
      const target = clamp(Math.round(current) + 1, 0, n);
      if (target === current) {
        deckDriven.current = false;
        return;
      }

      // Convert the throw into deck units against the same distance the
      // shuffle itself swings through, so a fling reads as the motion the
      // scroll already produces rather than an unrelated animation.
      /**
       * Nothing about the deck is touched here except its destination.
       *
       * The drag has already been driving the deck, so its spring is carrying
       * the throw's momentum — it IS the throw. Overwriting the velocity with
       * the raw pointer speed on top of that double-counted it and jerked the
       * card forward by five frames' worth of travel in one frame. The
       * pointer speed still decides WHETHER this is a throw, above; it just
       * has no business restating how fast the card is already going.
       */
      if (touch) {
        /**
         * The card is already out at `dx`, held there by the finger, and
         * the deck has not moved. Put the deck spring at the point on the
         * arc where the card IS — the arc's sideways swing is a sine over
         * its length, so this is its inverse — and give it the flick's
         * speed, so the throw carries on from the hand rather than pulling
         * the card back to the stack and setting off again.
         */
        const dir = dx >= 0 ? 1 : -1;
        arcDir.current = dir;
        const reach = Math.min(1, Math.abs(dx) / span);
        const t = Math.asin(reach) / Math.PI;
        snapSpring(deckSpring.current, current + t);
        /**
         * The hand's speed, in deck units. The arc's sideways travel is
         * `span * sin(pi * t)`, so a deck rate of 1 moves the card at
         * `pi * span * cos(pi * t)` px/s here; the finger's px/s divided by
         * that is the rate that keeps the card at the finger's speed.
         * Dividing by the span alone sent it off three times faster than
         * the hand, which was the kick at the start of every throw.
         */
        const slope = Math.PI * span * Math.max(0.3, Math.cos(Math.PI * t));
        deckSpring.current.velocity = clamp(Math.abs(vx) / slope, 0, DECK_MOTION.maxRate);
        p.set(deckSpring.current.value);
      }
      travelFrom.current = deckSpring.current.value;
      arcLocked.current = true;
      pTarget.set(target);
      /**
       * Hand the scroller its new position straight away. The travel spring
       * carries the cards the rest of the way, so there is nothing to wait
       * for, and scrolling picks up from the card that was thrown to rather
       * than from where the deck happened to be when it was grabbed.
       */
      commitDeck(target);
      deckDriven.current = false;
    },
    [pTarget, stage, deckDriven, commitDeck],
  );

  /**
   * Rewind the animation's own state by whole laps, in step with the scroller
   * doing the same. Nothing moves on screen: depth is measured around a ring,
   * so a position and that position minus a lap paint identically.
   */
  useEffect(() => {
    registerRebase((laps: number) => {
      const shift = laps * projects.length;
      if (!shift) return;
      deckSpring.current.value -= shift;
      travelFrom.current -= shift;
      lastGoal.current -= shift;
      p.set(deckSpring.current.value);
    });
    return () => registerRebase(null);
  }, [registerRebase, p]);

  // A pointer capture can be lost without a pointerup — release the deck
  // rather than leaving the scroller locked out.
  useEffect(() => {
    return () => {
      const g = gesture.current;
      if (g.timer) clearTimeout(g.timer);
    };
  }, []);

  /**
   * Video decoder budget.
   *
   * iOS Safari limits how many videos can decode at once — older devices to
   * roughly one. Six autoplaying clips will not hold frame rate on a phone, so
   * only the front card, its two neighbours and the selected project get a real
   * <video>. Everything else falls back to its poster.
   */
  /**
   * The card currently under a gesture, if any.
   *
   * Kept in React state because it decides which card carries the pointer
   * handlers, and that has to survive the whole gesture. The front card is not
   * a safe answer: a drag drives the deck, so the front card CHANGES half way
   * through the drag — at which point the handlers moved to a different card,
   * the pointerup never arrived, and the one in your hand was left stranded
   * out to the side with the gesture still notionally live.
   */
  const [dragIndex, setDragIndex] = useState(-1);

  /**
   * Seeded from `p` rather than from zero.
   *
   * `p` now starts at the opening card, and a MotionValue's initial value
   * fires no change event — so this sat at 0 while the deck was resting on
   * another card. Everything that asks which card is in front read the wrong
   * one: the card you could see was never asked to play, and the one that was
   * asked is behind it where nobody can see it.
   */
  const [nearIndex, setNearIndex] = useState(() =>
    frontIndex(p.get(), projects.length),
  );
  useMotionValueEvent(p, "change", (value) => {
    const next = (((Math.round(value) % projects.length) + projects.length) %
      projects.length);
    setNearIndex((prev) => (prev === next ? prev : next));
  });

  /**
   * Whether the deck has arrived and may be handled. See DECK_LIVE. A
   * project page or a return from one starts with the intro complete.
   */
  const [deckLive, setDeckLive] = useState(() => pi.get() >= DECK_LIVE.at);
  useMotionValueEvent(pi, "change", (v) => {
    setDeckLive((was) => (was ? v >= DECK_LIVE.out : v >= DECK_LIVE.at));
  });

  /**
   * Which shot the project page is showing. Drives which clips are mounted at
   * all, so the page never has more than a few decoding at once.
   */
  const [shotIndex, setShotIndex] = useState(0);
  /**
   * The shot change, and everything that comes with it, in ONE update.
   *
   * This used to be split: the index moved here and the push was set up in an
   * effect keyed on it. That left exactly one render where the shot had already
   * changed but `pushFrom` had not caught up — so the clip that was leaving
   * matched neither "the shot on screen" nor "the shot being pushed out", was
   * classed as gone, and got paused and wound back to its first frame. In full
   * view, on the frame the transition started.
   *
   * Nothing here is allowed to lag anything else, so it all goes in together
   * and React commits it as one render.
   */
  const shotRef = useRef(0);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** A push worked out but not yet started — see the layout effect below. */
  const pending = useRef<{ enter: number; wait: number } | null>(null);
  /**
   * The viewer's shape at the instant a push began.
   *
   * Read off the live springs rather than recomputed from the outgoing shot,
   * so a transition started while the last one is still settling continues from
   * where the frame actually IS rather than from where it was supposed to be.
   */
  const morphFrom = useRef<Record<string, number> | null>(null);
  const [pushSeq, setPushSeq] = useState(0);
  useEffect(() => () => {
    if (armTimer.current) clearTimeout(armTimer.current);
  }, []);

  useMotionValueEvent(cp, "change", (v) => {
    /**
     * Past the last shot is the return ending, and the ending shows the
     * project's own clip: the card is turning back into the deck card and
     * this is the deck card's face. Rounded past the end it named a shot
     * that does not exist, nothing was "in", and the card went to bare
     * white for the whole ending.
     */
    const rounded = Math.max(0, Math.round(v));
    const next = rounded >= shotShapes.length ? 0 : rounded;
    if (next === shotRef.current) return;
    const prev = shotRef.current;
    shotRef.current = next;
    setShotIndex(next);
    beginTransition(prev, next);
  });

  /**
   * The dip the viewer takes when a clip is replaced by one of the same shape.
   *
   * Its own spring rather than a nudge to the frame's: it is a separate motion
   * with a settle, a hold and a release, and it is multiplied into the scale at
   * the end so the morph underneath it stays exactly as it was.
   */
  /**
   * The viewer's own displacement, in pixels, after the arriving clip lands.
   *
   * Target is 0 — where it already is — so nothing pulls it anywhere. It moves
   * only because the handoff kicks it, and everything after that is the spring
   * getting back.
   */
  const carry = useRef({ value: 0, velocity: 0 });

  /**
   * The push.
   *
   * `pushX` is the incoming clip's offset, in pixels: it starts at `pushEnter`
   * and runs to 0. The outgoing clip derives its own position from the same
   * value — `pushX - pushEnter` — so one number places both, and they cannot
   * come apart. Sign is the direction of travel, so going back pushes back.
   */
  const pushIn = useMotionValue(0);
  const pushOut = useMotionValue(0);
  const [pushEnter, setPushEnter] = useState(0);
  const [pushFrom, setPushFrom] = useState(-1);
  /**
   * The size each of the two clips is drawn at while a transition runs.
   *
   * Each is the size its own shot settles at, so neither changes while the
   * viewer morphs between them — the arriving clip is already the size it will
   * be, and the departing one keeps the size it was. Null means "fill the
   * viewer", which is what everything does when nothing is in transition.
   */
  const [clipIn, setClipIn] = useState<Box | null>(null);
  const [clipOut, setClipOut] = useState<Box | null>(null);
  /**
   * Whether the card that became the viewer has finished arriving.
   *
   * The fixed clip size below is the viewer's FINAL size, and it used to be
   * applied the moment the route changed — while the card was still
   * deck-sized and springing toward the frame. The picture jumped to its
   * end size in one frame and the card grew around it: a visible zoom on
   * every arrival, and the card's corners cutting into a picture that was
   * already too big for it. Until the card has landed the clip fills the
   * card and scales with it, which is the whole point of a card that flies.
   */
  const [landed, setLanded] = useState(false);
  /**
   * Whether the shot on screen is allowed to play.
   *
   * False for the length of a crossing plus `playDelay`. A clip that starts the
   * instant the shot changes plays its opening while it is still sliding in and
   * half out of frame, which is the part of it most worth seeing.
   */
  const [armed, setArmed] = useState(true);
  const pushAt = useRef(0);
  const pushRunning = useRef(false);

  /**
   * The one piece of tuning that changes RENDERING rather than just numbers the
   * frame loop reads, so it has to come back through React: the clips fill the
   * viewer when it morphs to fit them and are contained when it does not.
   */
  /**
   * Seeded from the default rather than from the store, then synced on mount.
   *
   * The store is restored from localStorage as the module loads, so reading it
   * for a `useState` initialiser would have the client's first render disagree
   * with the server's — a hydration mismatch on nothing more than a debug
   * setting. Converging in the effect costs one extra render and cannot.
   */
  const [frameFixed, setFrameFixed] = useState(false);
  const [contentFixed, setContentFixed] = useState(false);
  useEffect(() => {
    const sync = () => {
      setFrameFixed(tuning.frameFixed);
      setContentFixed(tuning.contentFixed);
    };
    sync();
    return subscribeTuning(sync);
  }, []);

  const [selectedIndex, setSelectedIndex] = useState(-1);
  useMotionValueEvent(selected, "change", (v) => setSelectedIndex(v));

  const liveVideo = useMemo(() => {
    const n = projects.length;
    const set = new Set<number>();
    for (let d = -1; d <= 1; d++) set.add(((nearIndex + d) % n + n) % n);
    if (selectedIndex >= 0) set.add(selectedIndex);
    return set;
  }, [nearIndex, selectedIndex]);

  /**
   * The one card whose clip is allowed to run. Exactly one, always.
   *
   * `liveVideo` decides which cards get a real <video> — the front card and
   * its two neighbours, so stepping the deck is instant — and that is a
   * different question from which one is playing. Three elements were mounted
   * with `autoPlay` and only the front one was ever asked to stop, so the
   * neighbours ran for ever behind it.
   *
   * The fallback to `nearIndex` is what makes this safe to act on. `mode`
   * comes off the pathname during render and `selectedIndex` arrives a render
   * later through a MotionValue event, so between a click and the selection
   * landing there is a render where the card being carried into the viewer is
   * neither front nor selected. Reading that as "nothing is active" and
   * stopping it would rewind the clip at the exact moment the whole layer
   * exists to keep running. During that gap the front card IS the one being
   * carried, so naming it here costs nothing and closes the window.
   */
  const activeCard =
    mode === "case" && selectedIndex >= 0 ? selectedIndex : nearIndex;

  /**
   * The shot the current route change arrived on, or -1 before the first frame
   * of it has been seen.
   *
   * `settling` means only "a route change is still playing out", and while it
   * is set the viewer runs on the handoff spring — the loose, bouncy one that
   * carries the card from the deck to the page. That is right for the arrival
   * and wrong for everything after it: a change of shot is its own event and
   * wants the morph spring, but it was inheriting the handoff spring whenever
   * it happened before the arrival had finished settling.
   *
   * Which is why it showed up on a first visit and not later. The clips are
   * still being fetched and decoded then, so frames are long, and the spring
   * integrator advances at most 64ms of its own time per frame — the arrival
   * takes several times longer in wall-clock terms than it does once the media
   * is warm, and the first scroll lands inside it. Warm, it settles before
   * anyone can scroll, so the same code picks the morph spring.
   *
   * Recording the arrival shot ends the handoff on its own terms instead: the
   * moment the viewer is asked for a different shot, the arrival is over,
   * whatever the springs are still doing.
   */
  const arrivalShot = useRef(-1);

  // A route change retargets every spring. Nothing else needs to coordinate —
  // the springs simply take over from wherever the cards currently are, which
  // is why this needs none of the chained timers the prototype used.
  useEffect(() => {
    settling.current = true;
    arrivalShot.current = -1;
    setLanded(false);
    /**
     * The shot history belongs to the page being left, not the one arriving.
     *
     * Without this, landing on a project reads the last shot of the PREVIOUS
     * one as the shot being pushed out — a transition between two clips that
     * were never on screen together, measured against the new project's shapes,
     * playing over the top of the arrival.
     */
    /**
     * The shot this page opened on, so the next real change has something to
     * be measured against.
     *
     * Read here rather than seeded from the frame loop: the loop is the wrong
     * place for something the very first shot change depends on, and a layer
     * that has not painted yet would silently skip that first transition.
     *
     * The incoming page's own `cp.set(0)` fires its change event before this
     * effect, so it can still be read as a step from the LAST project's final
     * shot. That transition is real but stillborn — everything it set up is
     * cleared immediately below, in this same commit, before anything paints.
     */
    shotRef.current = Math.max(0, Math.round(cp.get()));
    pushRunning.current = false;
    setPushFrom(-1);
    setPushEnter(0);
    setClipIn(null);
    setClipOut(null);
    pushIn.set(0);
    pushOut.set(0);
  }, [transitionKey, pushIn, pushOut, cp]);

  /**
   * The shape of each screen on the project page: the intro, then one per
   * shot. Carries each clip's true proportions so the viewer can take its
   * shape from the footage rather than from a box authored by hand.
   */
  const shotShapes = useMemo(() => {
    if (selectedIndex < 0) return [];
    const project = projects[selectedIndex];
    return [
      { kind: "portrait" as const, aspect: undefined },
      ...project.shots.map((s) => ({ kind: s.kind, aspect: s.aspect })),
    ];
  }, [selectedIndex]);

  /**
   * Which steps are cuts, on the same index base as `shotShapes`.
   *
   * A shot's flag owns the boundary above it, so `cuts[k]` is read for the
   * step between k-1 and k whichever way it is walked. Index 0 is the intro
   * and has nothing above it to cut from.
   */
  const shotCuts = useMemo(() => {
    if (selectedIndex < 0) return [];
    return [false, ...projects[selectedIndex].shots.map((s) => !!s.cut)];
  }, [selectedIndex]);

  /**
   * Set for the one frame after a cut, to stop the viewer springing to a shape
   * it is allowed to arrive at instantly.
   *
   * Nothing to do where the two shots are the same shape — which is the case a
   * cut is for, and the target simply does not move. It matters for a cut
   * between different shapes: "no transition" has to mean the frame either,
   * otherwise the one thing left animating is the thing the flag was set to
   * stop.
   */
  const cutSnap = useRef(false);

  /**
   * Everything that happens when the shot changes.
   *
   * One measurement drives both halves. `assist` is how little the geometry
   * said — 1 when the frame barely moved, 0 when the morph carried the change
   * on its own — and the push distance and the dip depth are both scaled by it.
   * So a run of identically-shaped clips gets the full treatment and a dramatic
   * change of shape is left alone, out of one rule rather than a special case
   * per pair.
   *
   * The push is measured off the axis that moved LESS. A frame that grows
   * sideways while its height holds still reads as a stretch rather than as a
   * change of size, so by the only measure that matters it did not move at all.
   */
  /**
   * The size the clip on screen is drawn at: the size its own shot settles to.
   *
   * Set once and left alone. It was being released back to "fill the viewer"
   * when the push landed, which looked right for a frame and then was not — the
   * push runs 380ms and the frame's morph is a spring that is often still
   * settling past it, so handing the clip back to the frame at that moment
   * reattached it to something still moving and it grew the rest of the way in.
   * A visible zoom, right at the end, which is the one place nothing should be
   * moving.
   *
   * `beginTransition` sets the same value in the same commit as the shot index,
   * so a change of shot never waits a render for it. This is what keeps it
   * honest afterwards: the stage can change under a settled page — a window
   * resize, a change of tuning — and the clip has to follow the size its shot
   * WOULD settle to now, not the one it settled to then.
   */
  useEffect(() => {
    if (selectedIndex < 0 || !contentFixed || !shotShapes[shotIndex]) {
      setClipIn(null);
      return;
    }
    const f = caseFrame(shotIndex, shotShapes, stage, frameFixed);
    setClipIn((prev) =>
      prev && prev.w === f.w && prev.h === f.h ? prev : { w: f.w, h: f.h },
    );
  }, [shotIndex, selectedIndex, shotShapes, stage, frameFixed, contentFixed]);

  const beginTransition = (prev: number, shot: number) => {
    if (armTimer.current) clearTimeout(armTimer.current);
    if (selectedIndex < 0 || prev < 0 || prev === shot) return;
    if (!shotShapes[prev] || !shotShapes[shot] || reduced) return;

    // The frames as they will actually be drawn, not the authored boxes — the
    // fit can shrink either of them.
    const from = caseFrame(prev, shotShapes, stage, tuning.frameFixed);
    const to = caseFrame(shot, shotShapes, stage, tuning.frameFixed);
    // How much the PROPORTION changed, on a log scale so it reads the same in
    // both directions. A big change of shape is its own announcement and wants
    // no help; a small one gets everything.
    const turned = Math.abs(Math.log(to.w / to.h) - Math.log(from.w / from.h));
    const assist = clamp01(1 - turned / tuning.pushFalloff);

    /**
     * An authored cut beats the measurement.
     *
     * `assist` reads the geometry and answers 1 for two clips of the same
     * shape — the strongest push there is, because the frame said nothing. For
     * a pair that is one screen and then the same screen a step further on,
     * that reasoning is right about the geometry and wrong about the content,
     * and only the person who cut the clips can tell the difference.
     */
    const cut = shotCuts[Math.max(prev, shot)] === true;
    cutSnap.current = cut;

    const span = cut
      ? 0
      : tuning.pushOn
        ? tuning.pushMin + (tuning.pushMax - tuning.pushMin) * assist
        : 0;
    /**
     * Measured against the NARROWER of the two frames.
     *
     * The two clips are always exactly as wide as the frame, and they cover it
     * between them only while the offset stays inside that width — push them
     * further apart than the frame is wide and a gap opens between them with
     * the card's own background showing through it. The frame is morphing at
     * the same time, so the width to respect is the smaller end of the morph.
     */
    const dir = shot > prev ? 1 : -1;
    /**
     * How far the picture travels. 1 is a full push — the arriving clip starts
     * exactly out of sight; below that it begins already partly on screen and
     * slides the rest of the way.
     *
     * The distance is the mean of the two widths, not the arriving one's.
     *
     * What the arriving clip has to clear is the VIEWER as it stands when the
     * transition begins, and that is the width of the clip leaving, not the one
     * coming. Measured off its own width it worked in one direction and failed
     * in the other: going from a wide clip to a narrow one, a distance of the
     * narrow clip's width left it starting well inside the wide frame — dropped
     * on top of the outgoing picture instead of arriving from the edge.
     *
     * Half of each added together puts the arriving clip's leading edge exactly
     * on the frame's trailing edge, whichever way the sizes go, and keeps the
     * two exactly adjacent for the whole crossing. Where the two shots are the
     * same size — a run of identical shapes — it collapses to the viewer's own
     * width, so "1 = one viewport" still means what it says.
     *
     * When the clips instead fill the viewer they are both its width and there
     * is no mean to take; the wider end is what has to be cleared.
     */
    const span0 = tuning.contentFixed
      ? (from.w + to.w) / 2
      : Math.max(from.w, to.w);
    const enter = span0 * span * dir;

    /**
     * No push for this pair — but the last one's state has to go.
     *
     * Returning early left `pushFrom` naming a clip from an earlier, unrelated
     * transition, which kept it mounted, opaque and parked at that transition's
     * final offset. Off-frame and invisible until the viewer morphed wider,
     * at which point a clip nobody asked for slid into view from the side.
     */
    if (enter === 0) {
      pushRunning.current = false;
      setPushFrom(-1);
      setPushEnter(0);
      setClipIn(null);
      setClipOut(null);
      pushIn.set(0);
      pushOut.set(0);
    } else {
      setPushFrom(prev);
      setPushEnter(enter);
      setClipOut(tuning.contentFixed ? { w: from.w, h: from.h } : null);
      setClipIn(tuning.contentFixed ? { w: to.w, h: to.h } : null);
    }

    setArmed(false);
    /**
     * Handed to a layout effect rather than applied here.
     *
     * `pushIn` and `pushOut` are motion values: setting one moves whichever
     * element is currently bound to it, this instant, outside React. The roles
     * that decide which element THAT is are React state, and land a render
     * later. Set them here and for one frame the departing clip is drawn at the
     * arriving clip's offset — a flick sideways and back, on every transition.
     *
     * The layout effect below runs after the commit that assigns the roles and
     * before the browser paints, so nothing is ever placed by a stale role.
     */
    pending.current = {
      enter,
      wait: (enter === 0 ? 0 : tuning.pushMs) + tuning.playDelay,
    };
    setPushSeq((n) => n + 1);
  };

  /**
   * Start the push, once the roles it depends on are actually in the DOM.
   *
   * Keyed on a counter rather than on the values themselves, so two transitions
   * that happen to produce identical numbers still each get their own start.
   */
  useLayoutEffect(() => {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    const sel = selected.get();
    const live = sel >= 0 ? springs.current[sel] : null;
    morphFrom.current =
      live && tuning.morphOnPush
        ? (Object.fromEntries(
            MORPH_FIELDS.map((f) => [f, live[f].value]),
          ) as Record<string, number>)
        : null;
    pushIn.set(p.enter);
    pushOut.set(0);
    pushAt.current = performance.now();
    pushRunning.current = p.enter !== 0;
    if (armTimer.current) clearTimeout(armTimer.current);
    // Hold the arriving clip on its first frame until it has arrived and been
    // still for a beat.
    armTimer.current = setTimeout(() => setArmed(true), p.wait);
  }, [pushSeq, pushIn, pushOut, selected]);

  useAnimationFrame((time, deltaMs) => {
    if (stage.w === 0 || stage.h === 0) return;
    // Read once and clear, so a cut snaps for exactly one frame no matter how
    // many cards the loop below walks.
    const cutting = cutSnap.current;
    cutSnap.current = false;
    const dt = Math.min(deltaMs, 64) / 1000;
    const now = time / 1000;
    const n = projects.length;

    /**
     * The deck always travels to the card it is committed to.
     *
     * Scroll and throws both only choose that card; neither drives the deck
     * directly. So going to the back is one animation played out by one
     * spring, whether it was started by a scroll wheel or by a thrown card,
     * and there is no input that can hold it half way through the arc.
     */
    const goal = pTarget.get();
    // A newly committed card starts its move from wherever the deck is now,
    // which is what the overshoot clamp below is measured against.
    if (goal !== lastGoal.current) {
      travelFrom.current = deckSpring.current.value;
      if (goal !== travelFrom.current)
        travelDir.current = goal > travelFrom.current ? 1 : -1;
      lastGoal.current = goal;
      // A scroll always sends the card round the right, as authored. A throw
      // has already chosen its side and holds it with the lock above.
      if (!gesture.current.grabbed && !arcLocked.current) arcDir.current = 1;
    }

    if (gesture.current.grabbed && !gesture.current.touch) {
      /**
       * A held card is dragged ALONG THE ARC rather than around freely.
       * (A mouse. A finger holds the deck still and moves the card itself;
       * see the per-card target below.)
       *
       * The offset used to be independent of the deck, which meant letting go
       * threw the offset away and snapped the card's target back to the stack
       * before the arc swept it out again — the card briefly reversed, which
       * is the hitch. Driving the shuffle itself with the drag means the
       * release changes nothing about where the card is or where it is headed;
       * only what is moving it changes, from the finger to a spring.
       */
      const g2 = gesture.current;
      const span = Math.max(1, deckThrow(stage));
      if (g2.dx > 1) arcDir.current = 1;
      else if (g2.dx < -1) arcDir.current = -1;
      const progress = clamp(Math.abs(g2.dx) / span, 0, 1);
      const held = clamp(g2.grabP + progress, 0, projects.length);
      // Chased on the follow spring, so the card stays under the finger.
      stepSpring(deckSpring.current, held, dt, follow);
      p.set(deckSpring.current.value);
      travelFrom.current = deckSpring.current.value;
    } else if (reduced) {
      snapSpring(deckSpring.current, goal);
      p.set(goal);
    } else {
      stepSpring(deckSpring.current, goal, dt, SPRING.travel);
      // Never travel faster than a card can follow its own arc.
      deckSpring.current.velocity = clamp(
        deckSpring.current.velocity,
        -DECK_MOTION.maxRate,
        DECK_MOTION.maxRate,
      );
      /**
       * Clamped to the span of the move even though the spring overshoots it.
       *
       * Depth wraps: overshooting a whole card past the goal puts the NEXT
       * card at a hair under full depth, which is the start of the arc — so
       * the card behind would set off to the right in formation as if it had
       * been thrown too. Each card keeps its own spring and still settles with
       * bounce; it is only the shared index they read that is held inside the
       * move.
       */
      const lo = Math.min(travelFrom.current, goal);
      const hi = Math.max(travelFrom.current, goal);
      p.set(clamp(deckSpring.current.value, lo, hi));
      if (deckSpring.current.value === goal && deckSpring.current.velocity === 0) {
        /**
         * Arrived. If the move went the long way round, fold the extra lap
         * away now — a position and that position plus a full lap paint
         * identically, so this is invisible, and it puts the deck back inside
         * the range the scroller can express.
         */
        const landed = goal >= n ? goal - n : goal;
        if (landed !== goal) {
          pTarget.set(landed);
          snapSpring(deckSpring.current, landed);
          p.set(landed);
          lastGoal.current = landed;
        }
        travelFrom.current = landed;
        /**
         * Only hand the position back to the scroller when something OTHER
         * than the scroller put us here — a throw, or a jump the long way
         * round. Doing it on every settle fights ordinary scrolling: the deck
         * arrives, snaps the scroll position to the card it landed on, and
         * undoes whatever the wheel had just done. On load it also jumped
         * straight past the hero, because the deck settles on the first card
         * before you have scrolled at all.
         */
        if (deckDriven.current) {
          commitDeck(landed);
          deckDriven.current = false;
        }
        // Departure over; the next one goes round the right unless thrown.
        arcDir.current = 1;
        arcLocked.current = false;
      }
    }

    const pv = p.get();
    const pig = pi.get();
    const dealv = deal.get();
    const cpv = cp.get();
    // First frame of a route change: this is the shot it arrived on. Latched
    // here rather than in the effect so it cannot read a `cp` that the page has
    // not reset yet.
    if (settling.current && arrivalShot.current < 0)
      arrivalShot.current = Math.round(cpv);
    const sel = selected.get();
    const g = gesture.current;

    history.current.push(now, pv);
    introHistory.current.push(now, pig);

    /**
     * The first painted frame lands on the targets instead of springing to
     * them. Every card's springs start at zero, so without this the whole deck
     * flies in from the top-left corner of the stage on load — springs are for
     * moving between states, not for arriving at the first one.
     */
    const prime = !primed.current;

    const deckCfg = stage.mobile ? DECK.mobile : DECK.desktop;

    /**
     * Work out who is in the air together, before moving any of them.
     *
     * A move across several cards puts three or four of them on the same path
     * at almost the same moment. Left alone they trace each other exactly and
     * collide, and since stacking among them was a single shared value, which
     * one came out in front was down to document order. Ranking them by where
     * they are HEADED settles both: it fans their arcs apart in space, and it
     * gives each a distinct place in the stack.
     */
    {
      const goal = pTarget.get();
      const flying: number[] = [];
      for (let i = 0; i < n; i++) {
        const d = cardDepth(i, n, pv);
        scratch.current.dest[i] = (((i - goal) % n) + n) % n;
        if (arcOn.current[i] || d > n - 1) flying.push(i);
        scratch.current.arcScale[i] = 1;
        // Everything not in the air takes the deck's own side, which is all it
        // is used for there — the slide-aside as a card passes.
        scratch.current.side[i] = arcDir.current;
      }
      if (flying.length > 1) {
        // Nearest the front of the stack when this is over swings widest — it
        // is the one that has to get around everything else.
        flying.sort((a, b) => scratch.current.dest[a] - scratch.current.dest[b]);
        for (let k = 0; k < flying.length; k++) {
          scratch.current.arcScale[flying[k]] =
            1 + (flying.length - 1 - k) * DECK_MOTION.arcSpread;
          /**
           * Alternate sides down the group. The first still goes the way the
           * deck was sent — a throw keeps its direction — and the rest split
           * left and right from there, so a group riffles past the stack
           * instead of queueing up on one side of it.
           */
          if (DECK_MOTION.alternateSides)
            scratch.current.side[flying[k]] =
              k % 2 === 0 ? arcDir.current : -arcDir.current;
        }
      }
    }

    /**
     * Step the push, then the carry it hands off to.
     *
     * The push is a stated duration against a clock — this page has no
     * gestures, every shot change comes from a key or a button, so there is no
     * velocity coming in from a hand and nothing for a spring to be answering.
     * A curve is the honest description of it.
     *
     * The carry is a spring, because what it is doing IS physics: the viewer
     * has been knocked and is recovering. The integrator is stepped by hand
     * here, which is what lets one motion hand position and velocity to another
     * with no seam — the changeover is a continuation, not a restart.
     */
    /**
     * How far through the crossing we are, eased. Two readings of one clock:
     * the picture's, and the viewer's — which may be asked to finish earlier.
     * -1 means nothing is crossing.
     *
     * Still a single timebase, which is the part that mattered. `morphSpan`
     * only decides how much of it the shape change gets; both are read from
     * the same `t`, so neither can drift from the other, only lead it by a
     * stated amount.
     */
    let morphE = -1;
    if (pushRunning.current) {
      const t = (performance.now() - pushAt.current) / tuning.pushMs;
      const pushE = t >= 1 ? 1 : tuned.ease(t);
      morphE =
        t >= 1 ? 1 : tuned.ease(Math.min(1, t / Math.max(0.05, tuning.morphSpan)));
      const o = t >= 1 ? 0 : pushEnter * (1 - pushE);
      pushIn.set(o);
      pushOut.set(o - pushEnter);
      if (t >= 1) {
        pushRunning.current = false;
        /**
         * The departing clip is done.
         *
         * Its role reverts to idle, which pauses it and winds it back — it had
         * no way of ever getting there before, because `pushFrom` only changed
         * on the NEXT shot change. So it went on playing behind the viewer
         * indefinitely, burning a decoder on something nobody could see, and
         * arrived at its next turn part-way through itself.
         *
         * Safe to drop here rather than fading: the arriving clip is exactly
         * the viewer's size and sitting at zero by now, so it covers the frame
         * completely and there is nothing behind it left to see.
         */
        setPushFrom(-1);
        setClipOut(null);
        morphFrom.current = null;
        /**
         * The handoff.
         *
         * The clip's speed at the instant it lands, in pixels per second:
         * distance times the curve's exit slope, over the time it took. It goes
         * straight into the frame's spring as a velocity — the clip stops and
         * the viewer takes over at exactly the speed the clip had, so there is
         * no seam here to tune, only the physics.
         *
         * Signed by the direction of travel, so stepping backwards nudges the
         * viewer the other way.
         */
        const speed =
          (-pushEnter * tuned.exitSlope) / (tuning.pushMs / 1000);
        const v = speed * tuning.transfer;
        // The excursion of a spring released at rest is proportional to the
        // velocity it was released with, so the ceiling is applied here.
        const cap = tuning.maxPx * tuned.carryRate;
        carry.current.velocity = clamp(v, -cap, cap);
      }
    }

    // The viewer getting back to where it was. Always stepped, so the return
    // finishes even if the next shot arrives on top of it.
    if (carry.current.value !== 0 || carry.current.velocity !== 0)
      stepSpring(carry.current, 0, dt, tuned.spring, REST.px);

    const dpr = dprRef.current;
    let moving = false;

    for (let i = 0; i < n; i++) {
      const s = springs.current[i];
      const v = values.current[i];
      const dragging = g.grabbed && g.index === i;

      /**
       * Each card reads the deck a little later than the one in front of it,
       * so the stack arrives as six separate objects rather than one rigid
       * block. The held card is exempt — it has to sit under the pointer
       * exactly, and a card that lags the hand reads as broken, not as fluid.
       */
      const delay = reduced
        ? 0
        : Math.min(
            cardDepth(i, n, pv) * DECK_MOTION.stagger,
            DECK_MOTION.staggerMax,
          );
      const pDeck = dragging || delay === 0 ? pv : history.current.at(now - delay);

      /**
       * The intro is staggered the same way and on its own clock. During the
       * intro the deck sits at 0, so depth is just the card's index — the
       * front card arrives first and the rest follow it out of the hero,
       * instead of the whole block sliding into place together.
       */
      const introDelay = reduced
        ? 0
        : Math.min(
            cardDepth(i, n, pv) * DECK_MOTION.introStagger,
            DECK_MOTION.staggerMax,
          );
      const piDeck =
        introDelay === 0 ? pig : introHistory.current.at(now - introDelay);

      const depthNow = cardDepth(i, n, pv);
      const atBack = mode === "home" && depthNow > n - 2;

      /**
       * Start the clock the moment the card leaves the deck, from whichever
       * end it is leaving: forwards it departs from the front, backwards it
       * re-emerges from the back. Once running it is latched until it reaches
       * the other end, so the arc is never abandoned half way.
       */
      const leaving = mode === "home" && depthNow > n - 1;
      if (leaving && !arcOn.current[i]) {
        const entry = 1 - (depthNow - (n - 1));
        arcOn.current[i] = true;
        /**
         * From where it entered, at the speed the deck is going — not from
         * zero. A scroll's card leaves from rest and enters at nothing, so
         * this changes nothing there; a thrown card on a phone is already
         * out at the finger's reach when its arc begins, and a clock that
         * started at zero regardless drew it back to the stack for a frame
         * and set off again. That was the hitch at the launch.
         */
        if (entry < 0.5) {
          arcClock.current[i].value = entry;
          arcClock.current[i].velocity = Math.max(0, deckSpring.current.velocity);
        } else {
          arcClock.current[i].value = 1;
          arcClock.current[i].velocity = 0;
        }
      }

      let clock: number | undefined;
      if (arcOn.current[i]) {
        /**
         * Where the card is headed comes from the deck's COMMITTED
         * destination, not from which way it happens to be moving right now.
         *
         * A settling spring's velocity crosses zero and wobbles either side of
         * it, so reading direction from velocity made the aim flip as the move
         * ended: the card completed its arc, reversed it, and then ran it
         * again. The destination is a whole number that does not move during a
         * move, so it cannot do that. Past this card means it is going to the
         * back; at or before it means it belongs at the front.
         */
        /**
         * Where the card is headed follows the direction of the move as a
         * whole, not this card's index against the destination. The deck can
         * run past the end of its range when it wraps the long way round, and
         * an index comparison stops meaning anything there.
         */
        const aim = travelDir.current > 0 ? 1 : 0;

        if (g.grabbed && g.index === i) {
          /**
           * While a card is held, the hand IS the clock.
           *
           * Otherwise the arc runs at its own pace underneath the drag and the
           * card barely answers the pointer — it drifts along its path on a
           * schedule of its own while you are holding it, which is the
           * opposite of picking something up. The velocity is kept so the
           * spring takes over mid-motion at the release with the speed the
           * throw actually had.
           */
          const span = Math.max(1, deckThrow(stage));
          const held = clamp(Math.abs(g.dx) / span, 0, 1);
          arcClock.current[i].velocity =
            dt > 0 ? (held - arcClock.current[i].value) / dt : 0;
          arcClock.current[i].value = held;
        } else if (reduced) {
          snapSpring(arcClock.current[i], aim);
        } else {
          stepSpring(arcClock.current[i], aim, dt, SPRING.arcClock);
        }
        const v = clamp(arcClock.current[i].value, 0, 1);
        arcClock.current[i].value = v;
        clock = v;
        // Finished, and the deck has moved on past it: hand back to depth.
        if (!leaving && (v <= 0.001 || v >= 0.999)) {
          arcOn.current[i] = false;
          clock = undefined;
        }
      }
      const onArc = clock !== undefined;

      /**
       * This card's rise. Snapped, not sprung, on the first frame and
       * whenever the deal is reset to 0 (a replay puts the cards straight
       * back under the stage); otherwise a spring toward "dealt", softer by
       * the card's depth.
       */
      const dc = dealClock.current[i];
      const fc = fanClock.current[i];
      if (dealv <= 0) dealBegan.current = -1;
      else if (dealBegan.current < 0) dealBegan.current = dealSeen.current ? now : -2;
      if (!dealSeen.current || dealv <= 0 || reduced) {
        snapSpring(dc, dealv > 0 ? 1 : 0);
        snapSpring(fc, dealv > 0 ? 1 : 0);
      } else {
        /* The fan, a beat after the rise; -2 means the deal was already
         * on when this layer mounted, so it is open. */
        const d = Math.round(depthNow);
        const fanOn =
          dealBegan.current === -2 || now - dealBegan.current >= heroTune.fanDelay;
        stepSpring(
          fc,
          fanOn ? 1 : 0,
          dt,
          springConfig(
            heroTune.fanStiffness * Math.pow(1 - heroTune.fanFalloff, d),
            Math.max(0.05, heroTune.fanRatio - heroTune.fanRatioFalloff * d),
            heroTune.fanMass,
          ),
          REST.unit,
        );
        const soft = Math.pow(1 - heroTune.dealFalloff, Math.round(depthNow));
        stepSpring(
          dc,
          1,
          dt,
          springConfig(heroTune.dealStiffness * soft, heroTune.dealRatio, heroTune.dealMass),
          REST.unit,
        );
      }
      if (i === n - 1) dealSeen.current = true;

      const deck = deckCard(
        i,
        n,
        pDeck,
        piDeck,
        stage,
        reduced,
        scratch.current.side[i] as 1 | -1,
        clock,
        scratch.current.arcScale[i],
        dc.value,
        fc.value,
      );
      let target: Geo;
      if (mode === "case" && shotShapes.length > 0) {
        /**
         * The same element that was on the deck, retargeted to the page's
         * viewer — and it is also where every other card is headed.
         *
         * `shotShapes` can still be empty here: `mode` is read off the
         * pathname during render and the selection lands a render later, so
         * a frame can run on a project page before it knows the project. On
         * that frame the cards keep their deck geometry, which is where they
         * are anyway; the next frame has the shapes and carries on from it.
         */
        const viewer = caseFrame(cpv, shotShapes, stage, frameFixed);
        target = i === sel ? viewer : tidied(deck, viewer, reduced);
      } else if (dragging && g.touch) {
        /**
         * Under the finger. The card goes exactly where the hand goes, in
         * both directions, and the deck behind it does not move at all: on
         * a phone a card sliding out along a pre-baked arc while the finger
         * had moved an inch read as the deck doing its own thing. Whether
         * it goes round is decided at release, by the flick.
         */
        /**
         * Posed as the arc would pose it at this reach — the lean, the turn,
         * the lift — so that a release onto the arc changes nothing about
         * the card's attitude, only what is moving it. Held flat and square
         * it snapped into the arc's lean the instant it was let go.
         */
        const span = Math.max(1, deckThrow(stage));
        const reach = Math.min(1, Math.abs(g.dx) / span);
        const held = deckCard(
          i,
          n,
          pDeck,
          piDeck,
          stage,
          reduced,
          g.dx >= 0 ? 1 : -1,
          Math.asin(reach) / Math.PI,
          scratch.current.arcScale[i],
          dc.value,
          fc.value,
        );
        target = {
          ...held,
          x: deck.x + g.dx,
          y: held.y + g.dy,
          scale: held.scale * (reduced ? 1 : DRAG.liftScale),
        };
      } else if (dragging) {
        /**
         * No horizontal offset of its own: the drag is already moving this
         * card by driving the shuffle, and adding the raw pointer delta on top
         * would double it. What is left is a little vertical give so the card
         * feels picked up, and the lift.
         */
        target = {
          ...deck,
          y: deck.y + (reduced ? 0 : g.dy * DRAG.verticalGive),
          scale: deck.scale * (reduced ? 1 : DRAG.liftScale),
        };
      } else {
        target = deck;
      }

      /**
       * On a project page the shot stepping is a scrubber and must stay exact,
       * so it snaps and only springs while a route change settles. The deck is
       * now the opposite: it springs continuously, which is what lets a card
       * carry momentum out of a throw and what gives the stack its slack.
       */

      /**
       * The viewer on a project page keeps animating rather than snapping.
       *
       * Shot stepping is scroll-driven, and everything scroll-driven here
       * otherwise tracks exactly — but this one is a player changing shape to
       * fit the clip inside it, and a shape that snaps between sizes reads as
       * two players swapping rather than one adapting. The lag is the point.
       */
      const morphing = mode === "case" && i === sel;
      /**
       * True only while the card is still flying in from the deck. Latched off
       * the first shot the route change was seen on, rather than off `cp` at
       * effect time, so it does not depend on whether this layer's effect or
       * the page's `cp.set(0)` runs first.
       */
      const arriving =
        settling.current && Math.round(cpv) === arrivalShot.current;
      const animate =
        !prime &&
        !reduced &&
        !(cutting && i === sel) &&
        (settling.current || mode === "home" || morphing);
      /**
       * The back of the stack — the card in transit plus the slot it lands in
       * — runs a firmer, much less bouncy spring than the front. It is the one
       * carrying the arc, and a card still wobbling once it is parked behind
       * the others draws the eye to the least interesting thing on screen.
       */
      let config: SpringConfig;
      if (mode === "case")
        config = i === sel
          ? arriving
            ? SPRING.handoff
            : SPRING.morph
          : SPRING.drop;
      else if (dragging) config = follow;
      else if (atBack) config = SPRING.toBack;
      else config = SPRING.deck;

      /**
       * The viewer changing shape on the crossing's clock rather than its own.
       *
       * Only while a push is actually running, and never during the arrival
       * from the deck — that one is a spring by design and has no push to
       * borrow a clock from. It ends at exactly the target, so the spring picks
       * up from a standstill on the right value and has nothing left to do.
       */
      const onPushClock =
        morphing && !arriving && morphE >= 0 && morphFrom.current !== null;

      for (const field of FIELDS) {
        const shaped = onPushClock && MORPH_SET.has(field);
        const to = shaped
          ? lerp(morphFrom.current![field], target[field], morphE)
          : target[field];
        if (animate && !shaped) {
          stepSpring(s[field], to, dt, config);
          if (s[field].value !== to || s[field].velocity !== 0) moving = true;
        } else {
          snapSpring(s[field], to);
        }
        /**
         * The nudge rides on top of the morph rather than replacing it, so the
         * frame keeps changing shape underneath while it is being shoved. It is
         * added to x rather than multiplied into scale — the arriving picture
         * travels sideways, so what it hands over is sideways momentum.
         */
        let out =
          field === "x" && mode === "case" && i === sel
            ? s[field].value + carry.current.value
            : s[field].value;
        // Anything that gets laid out has to land on the pixel grid.
        if (LAYOUT_FIELDS.has(field)) out = Math.round(out * dpr) / dpr;
        v[field].set(out);
      }
      /* Publish the viewer's box for the page to sit things beside. */
      if (mode === "case" && i === sel) {
        viewer.x.set(v.x.get());
        viewer.y.set(v.y.get());
        viewer.w.set(v.w.get());
        viewer.h.set(v.h.get());
      }
      /**
       * The shadow, per frame, because it has to be able to leave.
       *
       * Held at full strength for everything at rest, so on the deck this
       * writes the same constant string every frame and costs nothing. It only
       * moves while a card is fading out behind an opening project, where it
       * runs ahead of the fade so the stack squares up flat rather than piling
       * six shadows into one slot.
       */
      if (mode === "case" && i === sel) v.shadow.set(SHADOW.device);
      else {
        const front = mode === "home" && i === nearIndex;
        const shade = clamp(
          (v.opacity.get() - TIDY.shadowGoneAt) / (1 - TIDY.shadowGoneAt),
          0,
          1,
        );
        // Always built, never the constant: the light is live-tunable.
        v.shadow.set(deckShadow(front, shade, heroLight()));
      }

      // On a project page the geometry owns stacking outright. On home it is
      // decided in the second pass below, once the stack's edge is known.
      if (mode !== "home") v.z.set(target.z);
      scratch.current.targetX[i] = target.x;
      scratch.current.dragging[i] = dragging;
      scratch.current.clock[i] = clock === undefined ? -1 : clock;
    }

    /**
     * Stacking order, in a second pass.
     *
     * It has to be, because deciding whether the departing card has cleared
     * the stack needs the stack's edge from THIS frame, and that is only known
     * once every card has been stepped. Carrying the edge over from the
     * previous frame was close enough to look right and wrong where it
     * mattered: the stack slides back rightward during the tuck, so a
     * frame-old edge reads short, and the faster the card travels the further
     * short it reads — widening the arc made the error worse rather than
     * better, which is what gave this away.
     */
    if (mode === "home") {
      /**
       * Measured across the SOLID front of the stack only.
       *
       * Rotation grows with depth, so a card with a large seeded angle sitting
       * deep juts out nearly 60px further than the rest — and the departing
       * card then could not clear the stack at all, so its flip fell through
       * to the end-of-arc fallback and it rode along on top for the whole
       * trip. Which cards those are depends on the seed, which is why it
       * happened on one transition in five and looked intermittent.
       *
       * The cards past this point are heavily washed and sit behind the ones
       * in front of them, so the sliver of them that protrudes cannot show a
       * card passing over it. Clearing the solid front is what the eye is
       * actually judging.
       */
      const solid = deckCfg.opaqueDepth + 1;
      let right = 0;
      let left = Infinity;
      for (let i = 0; i < n; i++) {
        const d = cardDepth(i, n, pv);
        if (d > n - 1 || d > solid) continue;
        const s = springs.current[i];
        right = Math.max(right, centreX(s) + halfExtent(s));
        left = Math.min(left, centreX(s) - halfExtent(s));
      }
      if (right > 0) stackRight.current = right;
      if (left < Infinity) stackLeft.current = left;
    }

    for (let i = 0; i < n; i++) {
      const s = springs.current[i];
      const v = values.current[i];
      if (mode !== "home") continue;
      if (scratch.current.dragging[i]) {
        behind.current[i] = false;
        v.z.set(90);
        continue;
      }
      const depth = cardDepth(i, n, pv);
      const clockNow = scratch.current.clock[i];
      if (clockNow < 0) {
        /**
         * Not in transit: stacking is just depth. `behind` is only seeded here
         * for whenever this card next leaves the stack, and which end it will
         * leave from depends on which way the deck is going — forwards it
         * departs from the front, backwards it re-emerges from the back.
         */
        behind.current[i] = depth > (n - 1) / 2;
        v.z.set(Math.round(50 - depth));
        continue;
      }

      /**
       * In transit. Whether the card is painted in front of the stack or
       * behind it is a latch, and BOTH edges of it are gated on the card
       * actually being clear of the stack.
       *
       * Only the going-behind edge used to be. Coming back — scrubbing up the
       * deck — flipped to the front at the midpoint of the arc no matter where
       * the card had got to, so it surfaced straight through the cards it was
       * still sitting behind. The two directions are mirror images of the same
       * move and need the same guard.
       */
      // The card's own arc position, not the deck's — the same value its
      // geometry was built from, so the two cannot disagree.
      const t = clockNow;
      const margin = s.w.value * DECK_MOTION.clearMargin;
      // Judged against the side THIS card went round, not the deck's.
      const side = scratch.current.side[i];
      const clear =
        side > 0
          ? centreX(s) - halfExtent(s) > stackRight.current + margin
          : centreX(s) + halfExtent(s) < stackLeft.current - margin;
      // Arrived wherever the arc was taking it, within a pixel or two.
      const settled = Math.abs(s.x.value - scratch.current.targetX[i]) < 2;

      /**
       * The card's own turnaround: the frame it stops travelling away from the
       * stack and starts coming back.
       *
       * This is the moment the swap belongs on, and it exists no matter how
       * fast the deck is moving. Waiting for the card to be fully CLEAR of the
       * stack does not: the card is a spring chasing its arc, so at speed it
       * never gets that far out, the test never passes, and the swap falls
       * through to an end-of-move fallback — riding across the top going
       * forwards, sitting low coming back. Both of those are the bug.
       *
       * At the turnaround the card is as far out as it is ever going to get,
       * so it is the least overlapped it will be and the point the eye reads
       * as it going round. Clearance still counts, and usually fires first on
       * an unhurried move; this is what catches the rest.
       */
      const turning = side > 0 ? s.x.velocity <= 0 : s.x.velocity >= 0;

      if (behind.current[i]) {
        // Back out over the top — at the turnaround, or once clear again, or
        // once home on the front where in front is right by definition.
        /**
         * The last third of the return is unconditional.
         *
         * On a fast jump backwards the card can still be accelerating outward
         * when its turn is over — it never turns around, so neither the
         * turnaround nor the clearance test ever fires and it stays behind the
         * stack right up to the moment it becomes the front card. Past this
         * point it is on its way to the front regardless, so showing it in
         * front is what it is about to be anyway; holding it back is the worse
         * of the two errors and it is the one that reads as broken.
         */
        if (t < 0.3 || (t < 0.65 && (clear || turning || (t <= 0.02 && settled)))) {
          behind.current[i] = false;
        }
      } else if (t >= 0.35 && (clear || turning || (t >= 0.98 && settled))) {
        // Down behind, at the turnaround or once clear.
        behind.current[i] = true;
      }

      /**
       * Cards in the air get distinct places, ordered by where they are going.
       *
       * They all used to share one value, so with several travelling at once
       * their order came down to document order and the wrong one surfaced in
       * front. Above the resting stack when they are passing over it, below it
       * when they have gone behind, and never equal to each other.
       */
      const dest = scratch.current.dest[i];
      v.z.set(behind.current[i] ? 44 - dest : 66 - dest);
    }

    if (prime) {
      primed.current = true;
      settling.current = false;
      // Landed on the targets outright: a project page opened directly.
      if (mode === "case") setLanded(true);
    }

    if (settling.current && !moving) {
      settling.current = false;
      if (mode === "case") setLanded(true);
    }
  });

  const perspective = stage.mobile
    ? DECK.mobile.perspective
    : DECK.desktop.perspective;

  return (
    <div
      aria-hidden={mode !== "home"}
      // How the phone's touch sheet finds a card under the finger.
      data-deck-layer
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 40,
        pointerEvents: "none",
        // The About page has no deck. The layer stays mounted — it is what
        // keeps the deck's state alive for the trip back — but draws nothing.
        display: mode === "about" ? "none" : undefined,
        // No transform here: a transformed ancestor becomes the containing block
        // for descendants and silently breaks position: sticky further down.
      }}
    >
      <div
        style={{
          position: "relative",
          width: stage.w,
          height: "100%",
          margin: "0 auto",
        }}
      >
        {projects.map((project, i) => {
          const v = values.current[i];
          const isFront = mode === "home" && i === nearIndex;
          // Whatever is under the hand keeps the pointer, front or not.
          const grabbable =
            mode === "home" && deckLive && (isFront || i === dragIndex);
          const isSelected = mode === "case" && i === selectedIndex;
          const wantsVideo = !!project.src && liveVideo.has(i);

          return (
            <motion.div
              key={project.slug}
              /**
               * Flat when it can be. A card at rest in the stack has no turn
               * about the vertical, but the perspective and the zero rotateY
               * still put it in 3D, and WebKit does not anti-alias the edge
               * of a 3D-transformed layer — every card in the stack on a
               * phone had a stair-stepped edge. With no turn to draw, the
               * perspective and the rotateY are left out and the transform
               * is a plain 2D one, which is rasterised with a smooth edge.
               * The arc, where the turn is real, keeps the 3D transform.
               */
              transformTemplate={(latest, generated) => {
                const ry = parseFloat(String(latest.rotateY ?? 0)) || 0;
                if (Math.abs(ry) >= 0.05) return generated;
                return generated
                  .replace(/perspective\([^)]*\)\s*/, "")
                  .replace(/rotateY\([^)]*\)\s*/, "");
              }}
              onPointerDown={
                grabbable ? (e) => onPointerDown(e, i) : undefined
              }
              onPointerMove={grabbable ? onPointerMove : undefined}
              onPointerUp={grabbable ? (e) => endGesture(e, false) : undefined}
              onPointerCancel={grabbable ? (e) => endGesture(e, true) : undefined}
              /**
               * Capture phase, so this runs before the link underneath it. A
               * press that became a drag must not also navigate on release.
               */
              onClickCapture={
                grabbable
                  ? (e) => {
                      if (!gesture.current.suppressClick) return;
                      e.preventDefault();
                      e.stopPropagation();
                      gesture.current.suppressClick = false;
                    }
                  : undefined
              }
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                x: v.x,
                y: v.y,
                width: v.w,
                height: v.h,
                borderRadius: v.radius,
                padding: v.pad,
                rotate: v.rotate,
                rotateY: v.rotateY,
                scale: v.scale,
                opacity: v.opacity,
                zIndex: v.z,
                transformPerspective: perspective,
                transformOrigin: "50% 50%",
                /**
                 * Two WebKit nudges for the edges of a transformed card.
                 * Neither changes what is drawn; both change how its edge
                 * is rasterised, from a hard pixel step to a covered one.
                 */
                outline: "1px solid transparent",
                WebkitBackfaceVisibility: "hidden",
                background: isSelected ? "var(--viewer)" : undefined,
                // Written by the frame loop. The viewer gets a wider, softer
                // shadow than a deck card — it is a single object on an empty
                // stage rather than one of a pile, so the shadow is lifting it
                // off the page rather than separating it from its neighbours —
                // and a card tidying itself away puts its shadow down as it
                // goes, which a value picked here could not express.
                boxShadow: v.shadow,
                pointerEvents: grabbable ? "auto" : "none",
                cursor: grabbable ? "grab" : undefined,
                // Vertical stays with the page so the deck still scrolls on a
                // phone; horizontal is ours, which is the throw gesture.
                touchAction: isFront ? "pan-y" : undefined,
                userSelect: "none",
                WebkitUserSelect: "none",
                /**
                 * Promote only what is actually moving in front of the viewer.
                 * The project viewer additionally resizes, and naming that
                 * keeps its contents on one layer through the morph rather
                 * than being re-rasterised from scratch each frame.
                 */
                willChange: isSelected
                  ? "width, height, transform"
                  : isFront
                    ? "transform, opacity"
                    : "auto",
              }}
            >
              <CardFace
                project={project}
                radius={v.innerRadius}
                scrim={v.scrim}
                pushIn={pushIn}
                pushOut={pushOut}
                pushFrom={isSelected ? pushFrom : -1}
                contain={isSelected && frameFixed}
                clipIn={isSelected && landed ? clipIn : null}
                clipOut={isSelected ? clipOut : null}
                viewer={isSelected}
                armed={!isSelected || armed}
                wantsVideo={wantsVideo}
                activeShot={isSelected ? shotIndex : 0}
                playing={i === activeCard}
                showBar={false}
              />
              {isFront ? (
                <Link
                  href={`/work/${project.slug}`}
                  draggable={false}
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: "inherit",
                    cursor: "pointer",
                  }}
                >
                  <span className="sr-only">
                    Open {project.title}, {project.year}
                  </span>
                </Link>
              ) : null}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * How many shots either side of the one on screen keep a clip mounted.
 *
 * Nothing downloads until its element exists, so this IS the loading policy —
 * a project page has up to nine shots and mounting them all would pull every
 * file on arrival and leave nine decoders alive at once, which is exactly what
 * a phone cannot afford. One either side means the next shot is ready before
 * it is asked for, without the page ever holding more than three.
 *
 * The usual trick for this is an IntersectionObserver, which does not apply
 * here: the shots do not scroll past, they are one frame that morphs in place.
 * Distance in shots is this page's equivalent of distance down the page.
 */
const SHOT_WINDOW = 1;

/**
 * A motion value that is always 0, for clips taking no part in a push.
 *
 * Shared and never written. It exists so a clip's position can be a MotionValue
 * in every case, rather than each one having to derive its own with a hook it
 * would only need some of the time.
 */
const ZERO = motionValue(0);

/** A clip's drawn size, in the card's own pixels. */
type Box = { w: number; h: number };

/**
 * Where and how big to draw one clip.
 *
 * Filling the viewer, it overhangs by a pixel on every side — sized to exactly
 * 100% it lands on fractional pixels as the frame morphs, and the sliver it
 * fails to cover shows the card's own dark background as a crawling edge.
 *
 * At a fixed size it is centred on the viewer instead and takes a little
 * overscan for the same reason: the two clips stay exactly adjacent by
 * construction, but the viewer's edges are being animated by a spring while
 * their positions come off a curve, and the two agree only to within a pixel
 * or so at any given frame.
 */
function clipBox(size: Box | null): React.CSSProperties {
  if (!size)
    return {
      top: -1,
      left: -1,
      width: "calc(100% + 2px)",
      height: "calc(100% + 2px)",
    };
  /**
   * The same single pixel the filling case overhangs by.
   *
   * It has to match: the clip hands over from one to the other the moment the
   * push lands, and a different overscan would be a different crop — a small
   * jump in the picture at exactly the moment it is supposed to be settling.
   */
  const over = 1;
  return {
    top: "50%",
    left: "50%",
    width: size.w + over * 2,
    height: size.h + over * 2,
    marginTop: -(size.h / 2 + over),
    marginLeft: -(size.w / 2 + over),
  };
}

/**
 * The push curve, its exit slope and the carry spring's excursion rate all
 * live in `lib/tuning.ts` rather than here, because all three are derived from
 * numbers that get dragged on a slider — they have to be able to change without
 * a reload, and a module constant cannot.
 */

/**
 * Fields that drive layout rather than a transform, and so have to land on
 * real pixels.
 *
 * A transform can sit anywhere it likes — the compositor resamples it and it
 * stays smooth. Width, height and radius cannot: they are laid out and painted,
 * and a value a third of a pixel from the grid puts the frame's edge across two
 * pixels and antialiases it differently every frame. Over a morph that reads as
 * the edges crawling. Rounded to the device's own pixels, so on a 2x display
 * this still moves in half-CSS-pixel steps and loses nothing visible.
 */
const LAYOUT_FIELDS = new Set(["w", "h", "radius", "pad", "innerRadius"]);

/**
 * The fields that describe the viewer's shape and where it sits.
 *
 * These are the ones the crossing can drive directly instead of springing —
 * everything else about the selected card is constant on a project page
 * (scale 1, opacity 1, square to the viewer), so there is nothing else for a
 * morph to be doing.
 */
const MORPH_FIELDS = [
  "x",
  "y",
  "w",
  "h",
  "radius",
  "pad",
  "innerRadius",
] as const satisfies readonly (typeof FIELDS)[number][];

const MORPH_SET: ReadonlySet<string> = new Set(MORPH_FIELDS);

/**
 * One shot's clip.
 *
 * No controls, no chrome: muted, looping, inline, and played or paused from
 * code rather than by the browser's own UI. Only the shot on screen runs; its
 * neighbours are mounted so they are buffered and ready, but held paused and
 * hidden.
 */
function ShotClip({
  shot,
  role,
  playing,
  armed,
  contain,
  size,
  x,
}: {
  shot: Shot;
  /**
   * What this clip is doing right now: arriving, leaving, or neither.
   *
   * It replaced a plain `active` flag because leaving is its own state. A
   * departing clip is still on screen for the length of the push and has to
   * keep running while it is.
   */
  role: "in" | "out" | "idle";
  /** Whether this card's clips should be running at all. */
  playing: boolean;
  /** Whether it may start yet — false while it is still crossing. */
  armed: boolean;
  /** Fit inside the viewer rather than filling it. */
  contain: boolean;
  /** Drawn size, or null to fill the viewer. */
  size: Box | null;
  x: MotionValue<number>;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.muted = true;
    /**
     * Not the active card: every one of its shots is stopped and wound back,
     * whatever role it happens to hold. `role === "out"` is normally protected
     * from a rewind because a departing clip is still on screen — but only the
     * active card has anything on screen at all, so there is nothing here to
     * protect and leaving one running is the bug.
     */
    if (!playing) {
      el.pause();
      el.currentTime = 0;
      return;
    }
    if (role === "in") {
      if (!armed) {
        // Arrived but not started: parked on its first frame while it crosses.
        el.pause();
        el.currentTime = 0;
        return;
      }
      // Always from the top. A clip that carries on from where it was left is
      // showing the middle of itself to someone arriving at its beginning.
      el.currentTime = 0;
      /**
       * Held on its poster until it can run at speed, rather than started on
       * the first frames to arrive. See `lib/playback.ts`. Returns the
       * teardown for that wait, so stepping off a shot mid-wait cancels it
       * instead of letting it start a clip nobody is looking at any more.
       */
      return playWhenReady(el);
    } else if (role === "out") {
      /**
       * Held, not stopped and not rewound.
       *
       * Pausing keeps the frame it was on — the picture you were just looking
       * at is the picture that leaves. What it must NOT do is touch
       * `currentTime`: winding it back here is what made a clip cut to its
       * first frame in full view on its way out.
       */
      el.pause();
    } else {
      el.pause();
      // Wound back rather than merely stopped, so nothing is running on in the
      // background and every arrival is the same arrival.
      el.currentTime = 0;
    }
  }, [role, playing, armed]);

  return (
    <motion.video
      ref={ref}
      /* The shot's own still if it names one, otherwise the one drawn beside
       * its clip by `npm run posters`. Undefined when neither exists, which
       * leaves the attribute off rather than pointing at a 404. */
      poster={media(shot.poster) ?? poster(shot.src)}
      draggable={false}
      muted
      loop
      playsInline
      /**
       * Decorative, and nothing about it is a media player.
       *
       * A <video> is focusable and remotely playable by default, and that is
       * enough for Safari to put its own transport controls over the top —
       * scrubber, AirPlay, picture-in-picture — on a clip that is meant to be
       * part of a page rather than something to operate. Taking it out of the
       * tab order also keeps the arrow keys stepping shots rather than seeking.
       */
      tabIndex={-1}
      controls={false}
      disablePictureInPicture
      disableRemotePlayback
      controlsList="nodownload nofullscreen noremoteplayback"

      /**
       * Metadata for the shots either side, the whole file for the one that is
       * about to run — `playWhenReady` waits on a readiness the browser will
       * never report for a clip that fetched a header and stopped. A shot two
       * steps away still costs a few kilobytes rather than a few megabytes,
       * which is what this attribute was for.
       */
      preload={preloadFor(playing && role === "in")}
      style={{
        /**
         * Overhangs its box by a pixel on every side.
         *
         * Sized to exactly 100% it lands on fractional pixels as the frame
         * morphs, and the sliver it fails to cover shows the card's own dark
         * background — a black edge that crawls, and against white footage it
         * is the most visible thing on screen. `cover` is already cropping, so
         * losing another pixel costs nothing and guarantees there is never a
         * gap to see through.
         */
        position: "absolute",
        ...clipBox(size),
        ...(contain
          ? { top: 0, left: 0, width: "100%", height: "100%", margin: 0 }
          : null),
        objectFit: contain ? "contain" : "cover",
        display: "block",
        x,
        /**
         * Never a dissolve. Two clips fading through each other reads as a
         * slideshow, and mid-fade both are half-there and neither is legible —
         * so a clip taking part in the change is fully opaque throughout, and
         * one that is not is simply absent. The push is what carries it.
         */
        opacity: role === "idle" ? 0 : 1,
        // The arriving clip covers the departing one, whichever way the
        // sequence is being walked.
        zIndex: role === "in" ? 3 : 2,
        pointerEvents: "none",
      }}
    >
      {shot.srcWebm ? (
        <source src={media(shot.srcWebm)} type="video/webm" />
      ) : null}
      {shot.src ? <source src={media(shot.src)} type="video/mp4" /> : null}
    </motion.video>
  );
}

/**
 * A shot that is a picture: a diagram, a still. Drawn exactly as a clip is
 * — same box, same push, same role — so it takes part in the sequence the
 * same way, it just never plays.
 */
function ShotStill({
  shot,
  role,
  contain,
  size,
  x,
}: {
  shot: Shot;
  role: "in" | "out" | "idle";
  contain: boolean;
  size: Box | null;
  x: MotionValue<number>;
}) {
  return (
    <motion.img
      src={media(shot.poster!)}
      alt=""
      draggable={false}
      style={{
        position: "absolute",
        ...clipBox(size),
        ...(contain
          ? { top: 0, left: 0, width: "100%", height: "100%", margin: 0 }
          : null),
        objectFit: contain ? "contain" : "cover",
        display: "block",
        x,
        opacity: role === "idle" ? 0 : 1,
        zIndex: role === "in" ? 3 : 2,
        pointerEvents: "none",
      }}
    />
  );
}

function CardFace({
  project,
  radius,
  scrim,
  contain,
  clipIn,
  clipOut,
  viewer,
  armed,
  pushIn,
  pushOut,
  pushFrom,
  wantsVideo,
  activeShot,
  playing,
  showBar,
}: {
  project: (typeof projects)[number];
  radius: MotionValue<number>;
  scrim: MotionValue<number>;
  /**
   * Where the arriving and departing clips sit during a push, in pixels.
   *
   * Two values rather than one derived from the other, so no clip has to work
   * out its own role from a hook — the frame loop writes both and each clip is
   * simply handed the one that applies to it.
   */
  pushIn: MotionValue<number>;
  pushOut: MotionValue<number>;
  /** The shot being pushed out, or -1 when nothing is moving. */
  pushFrom: number;
  /**
   * The size to draw the arriving and departing clips at, or null to fill the
   * viewer. Fixed for the whole crossing, so the morph reads as the viewer
   * opening over a still picture rather than as the picture zooming.
   */
  clipIn: Box | null;
  clipOut: Box | null;
  /** True for the one card acting as the project page's viewer. */
  viewer: boolean;
  /** Whether the clip on screen may run yet — false through a crossing. */
  armed: boolean;
  /**
   * Fit the clip inside the viewer rather than filling it.
   *
   * Only ever true when the viewer has stopped taking its shape from the clip.
   * While it morphs the two agree by construction and `cover` costs nothing;
   * once it does not, `cover` would crop a portrait recording down to a strip.
   */
  contain: boolean;
  wantsVideo: boolean;
  /** 0 is the intro, which shows the project's own clip; 1+ are its shots. */
  activeShot: number;
  /** Whether this card's clip should be running at all. */
  playing: boolean;
  showBar: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // The intro clip is shot 0, so it takes part in a push like any other: it
  // arrives when the viewer comes back to the overview and leaves when the
  // first shot pushes it out.
  const introIn = activeShot === 0;
  const introOut = pushFrom === 0 && !introIn;
  const introX = introIn ? pushIn : introOut ? pushOut : ZERO;
  /**
   * Shot 0's clip is subject to the same rule as every other: on screen only
   * while it is arriving or leaving.
   *
   * It had no opacity of its own, so it sat painted at full strength under the
   * whole sequence — invisible while the shots covered it, and the thing you
   * saw through any gap between them. A gap should show the viewer's own
   * surface; showing the project's hero clip instead reads as a rendering
   * fault, because it is one.
   */
  const introVisible = introIn || introOut ? 1 : 0;
  /**
   * The project's own clip FILLS its card whenever it is on screen — on the
   * deck, on the intro, and on the return ending — exactly as the deck draws
   * it. The shots are drawn at a box fixed when their transition began, so
   * a picture does not stretch while the viewer morphs; this one is the
   * deck card's face, and a box fixed for it could disagree with the card
   * it ends up in. On a phone it did: the ending card showed the clip a
   * fifth too large, cropped top and bottom. Only while it is being pushed
   * OUT does it keep the box it was pushed from.
   */

  /**
   * Whether the clip has a frame to show yet.
   *
   * Only the front card and its neighbours carry a <video>, so stepping the
   * deck mounts one on a card that had a picture, and on iOS a video paints
   * BLACK from the moment it exists until its poster or first frame has
   * arrived — a few frames of black over a card mid-swipe. The poster stays
   * mounted underneath as a plain image, always, and the video is held
   * invisible over it until it has something of its own to paint.
   */
  const [hasFrame, setHasFrame] = useState(false);
  useEffect(() => {
    const el = videoRef.current;
    if (!wantsVideo || !el) {
      setHasFrame(false);
      return;
    }
    if (el.readyState >= 2) {
      setHasFrame(true);
      return;
    }
    const ready = () => setHasFrame(true);
    el.addEventListener("loadeddata", ready);
    return () => el.removeEventListener("loadeddata", ready);
  }, [wantsVideo]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    // iOS refuses to autoplay unless the element is muted, and without
    // playsInline it takes the video fullscreen instead of playing in place.
    el.muted = true;
    /**
     * Not the active card: stopped and wound back, not merely left alone.
     *
     * This returned early, which combined with `autoPlay` on the element meant
     * a card that was never asked to play started anyway and was never asked
     * to stop. Winding back rather than pausing is what makes every card begin
     * at its own beginning — a deck you scrub through should not show you the
     * middle of a clip you have not watched.
     */
    if (!playing) {
      el.pause();
      el.currentTime = 0;
      return;
    }
    /**
     * The same three states every other clip has: arriving, leaving, gone.
     *
     * Leaving is the one that matters and the one this was missing. The intro
     * clip is shot 0, so stepping off the overview makes it the DEPARTING clip
     * — on screen, sliding out, and still being watched. Treating that as "not
     * the active shot" and winding it back to zero did exactly what it says:
     * the picture cut to its first frame in full view, mid-exit.
     *
     * It is left alone while it leaves, and reset only once it is gone — which
     * is the same commit that takes it to zero opacity, so the reset cannot be
     * seen.
     */
    // Held on its last frame while it leaves, never rewound here.
    if (introOut) {
      el.pause();
      return;
    }
    if (introIn && armed) {
      // Same hold as the shots — the opening clip is the first motion anyone
      // sees, so it is the last one that should be seen stuttering.
      return playWhenReady(el);
    } else if (introIn) {
      // Arrived but not started: parked on its first frame while it crosses.
      el.pause();
      el.currentTime = 0;
    } else {
      // A clip that is not on screen should not be burning a decoder.
      el.pause();
      el.currentTime = 0;
    }
  }, [wantsVideo, playing, introIn, introOut, armed]);

  return (
    <motion.div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        borderRadius: radius,
        overflow: "hidden",
        /**
         * The rounded clip, anti-aliased.
         *
         * `overflow: hidden` with a radius clips the picture to the corners,
         * and Safari rasterises that clip with a hard pixel edge once the
         * card is rotated or scaled — the stack on a phone had a stepped
         * outline on every card behind the front one. A mask over the same
         * box is applied with coverage, so its edge is smooth, and it makes
         * this face a compositing layer of its own, rasterised flat and then
         * transformed. The gradient is opaque everywhere; only its presence
         * matters.
         */
        WebkitMaskImage: "-webkit-radial-gradient(white, black)",
        willChange: "transform",
        /**
         * As the viewer, a plain white surface — and it is meant to be SEEN.
         *
         * The clips are drawn at a fixed size while the frame morphs around
         * them, and two fixed-size pictures cannot tile a window that is
         * changing shape, so on a large morph there is genuinely a moment with
         * bare frame either side of the picture. White is the choice that makes
         * that moment read as the viewer opening onto empty space rather than
         * as a hole.
         *
         * On the deck it is placeholder scaffolding instead — a stripe fill
         * standing in for real media, with the page colour behind it so a seam
         * at the edge is invisible rather than merely thin.
         */
        /**
         * Long-hand, never the `background` shorthand.
         *
         * The two were mixed here — a shorthand and a `backgroundColor`
         * alongside it — which React warns about and is right to: the
         * shorthand resets the colour, so which one wins came down to the
         * order the object happened to be written in.
         */
        backgroundColor: viewer
          ? "var(--viewer)"
          : project.hue === undefined
            ? "var(--shot-empty)"
            : "var(--page)",
        backgroundImage:
          !viewer && project.hue !== undefined
            ? stripeFill(project.hue)
            : undefined,
        backgroundSize:
          !viewer && project.hue !== undefined ? "420px 100%" : undefined,
      }}
    >
      {/*
        The picture, as one layer.

        The clips inside it move independently during a push; this groups them
        as the footage, below the scrim and the window chrome, which belong to
        the frame rather than to what is playing in it. It is also what keeps
        the whole picture transparent to the pointer in one place.
      */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 2,
          /**
           * Transparent to the pointer, and it has to be said explicitly.
           *
           * A positive z-index puts this above the card's own <Link>, which
           * carries no z-index of its own — so without this the picture eats
           * every click and the deck stops opening anything. The clips inside
           * inherit it, which is what they want too: the link is the whole
           * card, not a region of it.
           */
          pointerEvents: "none",
        }}
      >
        {project.poster ? (
          <motion.img
            src={asset(project.poster)}
            alt=""
            draggable={false}
            style={{
              position: "absolute",
              ...clipBox(introOut ? clipOut : null),
              opacity: introVisible,
              ...(contain
                ? { top: 0, left: 0, width: "100%", height: "100%", margin: 0 }
                : null),
              objectFit: contain ? "contain" : "cover",
              x: introX,
              // Same level as the video, which follows it and so paints over.
              zIndex: introIn ? 3 : 2,
            }}
          />
        ) : null}
        {wantsVideo ? (
          <motion.video
            ref={videoRef}
            poster={asset(project.poster)}
            draggable={false}
            /**
             * No `autoPlay`. The effect below is the only thing that decides
             * whether this clip runs, and `autoPlay` is a second opinion that
             * arrives first — it starts on mount, before an effect can say
             * otherwise, so every neighbour painted a frame or two of playback
             * on its way to being stopped. The shots' clips have never carried
             * it and start the same way: by being asked to.
             */
            muted
            loop
            playsInline
        /**
         * Decorative, and nothing about it is a media player.
         *
         * A <video> is focusable and remotely playable by default, and that is
         * enough for Safari to put its own transport controls over the top —
         * scrubber, AirPlay, picture-in-picture — on a clip that is meant to be
         * part of a page rather than something to operate. Taking it out of the
         * tab order also keeps the arrow keys stepping shots rather than seeking.
         */
        tabIndex={-1}
        controls={false}
        disablePictureInPicture
        disableRemotePlayback
        controlsList="nodownload nofullscreen noremoteplayback"

            /**
             * Auto only on the active card's arriving clip, so the fetch
             * overlaps the transition and `playWhenReady` has something to wait
             * on. `introIn` alone is not that card: it is `activeShot === 0`,
             * which every card parked at its overview satisfies — so on a
             * project page it put three heroes on auto, and the two nobody was
             * looking at pulled against the shot that was playing. `playing` is
             * the flag that means this card and no other.
             */
            preload={preloadFor(playing && introIn)}
            style={{
              position: "absolute",
              ...clipBox(introOut ? clipOut : null),
              // Nothing to paint yet: the poster underneath shows instead.
              opacity: hasFrame ? introVisible : 0,
              // Contained, the overhang would show as a sliver of the clip
              // outside its own letterbox — it only exists to hide sub-pixel
              // seams under `cover`, where there is nothing behind it anyway.
              ...(contain
                ? { top: 0, left: 0, width: "100%", height: "100%", margin: 0 }
                : null),
              objectFit: contain ? "contain" : "cover",
              display: "block",
              x: introX,
              // The arriving clip covers the departing one, whichever way the
              // sequence is being walked.
              zIndex: introIn ? 3 : 2,
            }}
          >
            {project.srcWebm ? (
              <source src={media(project.srcWebm)} type="video/webm" />
            ) : null}
            {project.src ? (
              <source src={media(project.src)} type="video/mp4" />
            ) : null}
          </motion.video>
        ) : null}

        {/*
          The shots' own clips, layered over the card.

          Deliberately NOT by swapping the source on the element above: that one
          came off the deck and is still playing the clip it was playing there,
          and changing its source would tear that down — which is the one thing
          this whole layer exists to avoid. It stays as the intro's face and the
          shots stack on top of it.
        */}
        {project.shots.map((shot, k) => {
          const index = k + 1;
          if (Math.abs(index - activeShot) > SHOT_WINDOW) return null;
          const role =
            index === activeShot ? "in" : index === pushFrom ? "out" : "idle";
          if (!shot.src && !shot.srcWebm) {
            // A still: a shot that is a picture rather than a clip.
            if (!shot.poster) return null;
            return (
              <ShotStill
                key={shot.n}
                shot={shot}
                role={role}
                contain={contain}
                size={role === "in" ? clipIn : role === "out" ? clipOut : null}
                x={role === "in" ? pushIn : role === "out" ? pushOut : ZERO}
              />
            );
          }
          return (
            <ShotClip
              key={shot.n}
              shot={shot}
              role={role}
              armed={armed}
              contain={contain}
              size={role === "in" ? clipIn : role === "out" ? clipOut : null}
              playing={playing}
              x={role === "in" ? pushIn : role === "out" ? pushOut : ZERO}
            />
          );
        })}
      </div>

      {/*
        Depth wash.
        
        Inside the clipped face so it takes the card's corners, and above the
        media so it veils it. This is what carries depth now — painted on the
        card rather than making the card transparent, so a card further back
        never shows the one beneath it through itself.
      */}
      <motion.div
        aria-hidden
        data-scrim
        style={{
          position: "absolute",
          inset: 0,
          background: "var(--veil)",
          opacity: scrim,
          pointerEvents: "none",
          zIndex: 3,
        }}
      />

      {/* Desktop-window chrome, for the shots framed as a desktop app. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          height: 30,
          display: "flex",
          alignItems: "center",
          gap: 6,
          paddingLeft: 14,
          background: "oklch(0.14 0.006 60 / 0.88)",
          opacity: showBar ? 1 : 0,
          transition: "opacity .5s ease",
          zIndex: 4,
        }}
      >
        {[0, 1, 2].map((d) => (
          <span
            key={d}
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "oklch(0.98 0 0 / 0.28)",
            }}
          />
        ))}
      </div>
    </motion.div>
  );
}
