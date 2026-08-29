"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  motion,
  motionValue,
  useAnimationFrame,
  useMotionValueEvent,
  useReducedMotion,
  type MotionValue,
} from "motion/react";
import Link from "next/link";
import { useStage } from "./stage";
import { projects, stripeFill } from "@/lib/projects";
import { asset } from "@/lib/asset";
import { SHADOW, SPRING, DECK, DECK_MOTION, DRAG } from "@/lib/design";
import {
  cardDepth,
  caseFrame,
  deckCard,
  deckCardSize,
  deckOrigin,
  deckThrow,
  frameHasBar,
  railCard,
  type Geo,
} from "@/lib/geometry";
import {
  clamp,
  spring,
  snapSpring,
  springConfig,
  stepSpring,
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
  z: MotionValue<number>;
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
    z: motionValue(0),
  };
}

/**
 * Where a card goes when it isn't the one being opened: down and out, with a
 * little rotation. The count of objects changing from six to one is half of
 * what signals the navigation, so this drop has to read clearly.
 */
function dropped(geo: Geo, i: number, reduced: boolean): Geo {
  return {
    ...geo,
    y: geo.y + (reduced ? 0 : 300 + i * 26),
    rotate: reduced ? 0 : geo.rotate + (i % 2 ? 9 : -9),
    opacity: 0,
  };
}

export default function MediaLayer() {
  const {
    p,
    pTarget,
    pi,
    cp,
    selected,
    mode,
    stage,
    transitionKey,
    deckDriven,
    commitDeck,
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
    /** Set the moment a press becomes a drag, so the release isn't a click. */
    suppressClick: false,
    /** Held so the capture can be taken late — see `grab`. */
    el: null as HTMLElement | null,
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

  /** Where the current move started, so the overshoot can be clamped to it. */
  const travelFrom = useRef(0);
  const lastGoal = useRef(0);
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
  /** Scratch for the second pass, allocated once rather than per frame. */
  const scratch = useRef({
    targetX: new Float64Array(projects.length),
    dragging: new Array<boolean>(projects.length).fill(false),
  });
  const deckSpring = useRef(spring(0));

  const grab = useCallback(() => {
    const g = gesture.current;
    if (g.grabbed || g.index < 0) return;
    g.grabbed = true;
    g.suppressClick = true;
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
  }, [deckDriven]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent, i: number) => {
      if (mode !== "home") return;
      // Left button and touch/pen only; a right-click is a context menu.
      if (e.button !== 0) return;
      const g = gesture.current;
      if (g.timer) clearTimeout(g.timer);
      g.pointerId = e.pointerId;
      g.index = i;
      g.grabbed = false;
      g.startX = e.clientX;
      g.startY = e.clientY;
      g.dx = 0;
      g.dy = 0;
      g.travel = 0;
      g.samples = [{ t: performance.now(), x: e.clientX }];
      g.suppressClick = false;
      g.el = e.currentTarget as HTMLElement;
      g.timer = setTimeout(grab, DRAG.longPress);
    },
    [mode, grab],
  );

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
        if (g.timer) clearTimeout(g.timer);
        g.timer = null;
        grab();
      }
    },
    [grab],
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

      const thrown =
        !cancelled &&
        (Math.abs(vx) > DRAG.flingVelocity ||
          Math.abs(dx) > DRAG.flingDistance);

      if (!thrown) {
        // Not enough to send it back — the card springs home and the deck
        // position never moved, so the scroller already agrees with us.
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
      const throwPx = Math.max(1, deckThrow(stage));
      travelFrom.current = deckSpring.current.value;
      deckSpring.current.velocity = Math.abs(vx) / throwPx;
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
  const [nearIndex, setNearIndex] = useState(0);
  useMotionValueEvent(p, "change", (value) => {
    const next = (((Math.round(value) % projects.length) + projects.length) %
      projects.length);
    setNearIndex((prev) => (prev === next ? prev : next));
  });

  const [selectedIndex, setSelectedIndex] = useState(-1);
  useMotionValueEvent(selected, "change", (v) => setSelectedIndex(v));

  const liveVideo = useMemo(() => {
    const n = projects.length;
    const set = new Set<number>();
    for (let d = -1; d <= 1; d++) set.add(((nearIndex + d) % n + n) % n);
    if (selectedIndex >= 0) set.add(selectedIndex);
    return set;
  }, [nearIndex, selectedIndex]);

  // A route change retargets every spring. Nothing else needs to coordinate —
  // the springs simply take over from wherever the cards currently are, which
  // is why this needs none of the chained timers the prototype used.
  useEffect(() => {
    settling.current = true;
  }, [transitionKey]);

  const shotKinds = useMemo(() => {
    if (selectedIndex < 0) return [];
    const project = projects[selectedIndex];
    return ["portrait" as const, ...project.shots.map((s) => s.kind)];
  }, [selectedIndex]);

  useAnimationFrame((time, deltaMs) => {
    if (stage.w === 0 || stage.h === 0) return;
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
      lastGoal.current = goal;
    }
    if (reduced) {
      snapSpring(deckSpring.current, goal);
      p.set(goal);
    } else {
      stepSpring(deckSpring.current, goal, dt, SPRING.travel);
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
      if (deckSpring.current.value === goal && deckSpring.current.velocity === 0)
        travelFrom.current = goal;
    }

    const pv = p.get();
    const pig = pi.get();
    const cpv = cp.get();
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

      const deck = deckCard(i, n, pDeck, piDeck, stage, reduced);
      let target: Geo;
      if (mode === "case") {
        if (i === sel) {
          // Desktop steps through shots vertically; mobile swipes a horizontal
          // rail. Either way this is the same element that was on the deck.
          target = stage.mobile
            ? railCard(0, cpv, stage, reduced)
            : caseFrame(cpv, shotKinds, stage);
        } else {
          target = dropped(deck, i, reduced);
        }
      } else if (dragging) {
        const tilt = clamp(
          g.dx * DRAG.rotatePerPx,
          -DRAG.rotateMax,
          DRAG.rotateMax,
        );
        target = {
          ...deck,
          x: deck.x + g.dx,
          y: deck.y + g.dy,
          rotate: deck.rotate + (reduced ? 0 : tilt),
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
      const animate =
        !prime && !reduced && (settling.current || mode === "home");
      /**
       * The back of the stack — the card in transit plus the slot it lands in
       * — runs a firmer, much less bouncy spring than the front. It is the one
       * carrying the arc, and a card still wobbling once it is parked behind
       * the others draws the eye to the least interesting thing on screen.
       */
      const atBack = mode === "home" && cardDepth(i, n, pv) > n - 2;
      let config: SpringConfig;
      if (mode === "case") config = i === sel ? SPRING.handoff : SPRING.drop;
      else if (dragging) config = follow;
      else if (atBack) config = SPRING.toBack;
      else config = SPRING.deck;

      for (const field of FIELDS) {
        const to = target[field];
        if (animate) {
          stepSpring(s[field], to, dt, config);
          if (s[field].value !== to || s[field].velocity !== 0) moving = true;
        } else {
          snapSpring(s[field], to);
        }
        v[field].set(s[field].value);
      }
      // On a project page the geometry owns stacking outright. On home it is
      // decided in the second pass below, once the stack's edge is known.
      if (mode !== "home") v.z.set(target.z);
      scratch.current.targetX[i] = target.x;
      scratch.current.dragging[i] = dragging;
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
      let edge = 0;
      for (let i = 0; i < n; i++) {
        if (cardDepth(i, n, pv) > n - 1) continue;
        const s = springs.current[i];
        edge = Math.max(edge, centreX(s) + halfExtent(s));
      }
      if (edge > 0) stackRight.current = edge;
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
      if (depth < n - 1) {
        behind.current[i] = false;
        v.z.set(Math.round(50 - depth));
        continue;
      }
      const t = 1 - (depth - (n - 1));
      if (t < 0.5) {
        behind.current[i] = false;
      } else if (!behind.current[i]) {
        const cleared =
          centreX(s) - halfExtent(s) >
          stackRight.current + s.w.value * DECK_MOTION.clearMargin;
        /**
         * The fallback exists only for a card that has come to rest on its
         * place at the back: parked behind the others but painted in front of
         * them is the same defect mirrored. Gated on having ARRIVED, not on
         * the arc having notionally finished — `t` is measured in target space
         * and the card trails its target, so firing on `t` alone dropped the
         * card while it was still out and mid-tuck.
         */
        const arrived =
          t >= 0.985 && Math.abs(s.x.value - scratch.current.targetX[i]) < 2;
        if (cleared || arrived) behind.current[i] = true;
      }
      v.z.set(behind.current[i] ? 50 - (n - 1) : 60);
    }

    if (prime) {
      primed.current = true;
      settling.current = false;
    }

    if (settling.current && !moving) settling.current = false;
  });

  const perspective = stage.mobile
    ? DECK.mobile.perspective
    : DECK.desktop.perspective;

  return (
    <div
      aria-hidden={mode === "case"}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 40,
        pointerEvents: "none",
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
          const isSelected = mode === "case" && i === selectedIndex;
          const wantsVideo = !!project.src && liveVideo.has(i);

          return (
            <motion.div
              key={project.slug}
              onPointerDown={
                isFront ? (e) => onPointerDown(e, i) : undefined
              }
              onPointerMove={isFront ? onPointerMove : undefined}
              onPointerUp={isFront ? (e) => endGesture(e, false) : undefined}
              onPointerCancel={isFront ? (e) => endGesture(e, true) : undefined}
              /**
               * Capture phase, so this runs before the link underneath it. A
               * press that became a drag must not also navigate on release.
               */
              onClickCapture={
                isFront
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
                background: isSelected ? "var(--device)" : undefined,
                boxShadow: isFront || isSelected
                  ? SHADOW.cardFront
                  : SHADOW.cardBack,
                pointerEvents: isFront ? "auto" : "none",
                cursor: isFront ? "grab" : undefined,
                // Vertical stays with the page so the deck still scrolls on a
                // phone; horizontal is ours, which is the throw gesture.
                touchAction: isFront ? "pan-y" : undefined,
                userSelect: "none",
                WebkitUserSelect: "none",
                // Promote only what is actually moving in front of the viewer.
                willChange: isFront || isSelected ? "transform, opacity" : "auto",
              }}
            >
              <CardFace
                project={project}
                radius={v.innerRadius}
                wantsVideo={wantsVideo}
                showBar={
                  isSelected &&
                  !stage.mobile &&
                  shotKinds.length > 0 &&
                  frameHasBar(
                    shotKinds[
                      Math.max(0, Math.min(shotKinds.length - 1, Math.round(cp.get())))
                    ],
                  )
                }
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

function CardFace({
  project,
  radius,
  wantsVideo,
  showBar,
}: {
  project: (typeof projects)[number];
  radius: MotionValue<number>;
  wantsVideo: boolean;
  showBar: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    // iOS refuses to autoplay unless the element is muted, and without
    // playsInline it takes the video fullscreen instead of playing in place.
    el.muted = true;
    const played = el.play();
    if (played && played.catch) played.catch(() => {});
  }, [wantsVideo]);

  return (
    <motion.div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        borderRadius: radius,
        overflow: "hidden",
        // Placeholder scaffolding — a stripe fill standing in for real media.
        background: stripeFill(project.hue),
        backgroundSize: "420px 100%",
      }}
    >
      {wantsVideo ? (
        <video
          ref={videoRef}
          poster={asset(project.poster)}
          draggable={false}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        >
          {project.srcWebm ? (
            <source src={asset(project.srcWebm)} type="video/webm" />
          ) : null}
          {project.src ? (
            <source src={asset(project.src)} type="video/mp4" />
          ) : null}
        </video>
      ) : project.poster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={asset(project.poster)}
          alt=""
          draggable={false}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      ) : null}

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
