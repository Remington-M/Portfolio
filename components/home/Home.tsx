"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  motion,
  useMotionValueEvent,
  useTransform,
  useReducedMotion,
} from "motion/react";
import { useStage } from "@/components/media/stage";
import Header from "@/components/Header";
import Ledger from "./Ledger";
import Ticks from "@/components/Ticks";
import { projects } from "@/lib/projects";
import { DECK, DECK_MOTION } from "@/lib/design";
import { clamp01 } from "@/lib/spring";
import { frontIndex, stageY } from "@/lib/geometry";

/**
 * The home screen.
 *
 * Nothing on this page actually moves down the document. A tall scroll
 * container drives a sticky stage, and every position is a function of its
 * scrollTop — which is what makes the deck shuffle continuous and exactly
 * reversible when you scrub back up.
 *
 * The cards themselves are not here. They live in the persistent media layer so
 * they can survive the navigation into a project page.
 */
export default function Home() {
  const {
    p,
    pTarget,
    pi,
    stage,
    mobile,
    restoreDeck,
    rememberDeck,
    deckDriven,
    registerDeckScroll,
    rebaseDeck,
  } = useStage();
  const reduced = useReducedMotion() ?? false;
  const scrollRef = useRef<HTMLDivElement>(null);

  /**
   * One continuous scroll, inferred from the gaps between its events, and how
   * many cards it has turned through so far.
   */
  const lastScrollAt = useRef(0);
  const turnedThisScroll = useRef(0);
  const [front, setFront] = useState(() => frontIndex(p.get(), projects.length));

  const cfg = mobile ? DECK.mobile : DECK.desktop;
  const n = projects.length;

  /** Scroll distance for one full turn of the deck. */
  const lap = n * cfg.step;

  /**
   * Two laps of scroll, not one.
   *
   * The deck runs for ever, and it does that by quietly rewinding: once a full
   * turn has been scrolled the scroller is pulled back a lap and the animation
   * is rewound with it. Because depth is measured around a ring, the position
   * before and after that rewind paint identically, so nothing moves. Holding
   * two laps of room means there is always a lap of scroll left ahead of the
   * rewind point, so the wheel never runs into the end of the page.
   */
  const scrollHeight = cfg.intro + cfg.hold + 2 * lap + stage.h;

  /**
   * Scroll position at which project `value` sits at rest.
   *
   * The first project rests in the MIDDLE of the dwell rather than at its end,
   * so there is scroll room on both sides of it. Landing it at the end would
   * keep the original problem: the card would arrive and start shuffling away
   * on the very next pixel, which is what made it feel skipped.
   */
  const deckTop = useCallback(
    (value: number) =>
      value <= 0
        ? cfg.intro + cfg.hold / 2
        : cfg.intro + cfg.hold + value * cfg.step,
    [cfg.intro, cfg.hold, cfg.step],
  );

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    // A gesture owns the deck while it runs. Writing `p` from scroll here would
    // fight the drag and snap the card back on the next scroll event.
    if (deckDriven.current) return;

    const top = el.scrollTop;
    pi.set(Math.min(1, top / cfg.intro));

    /**
     * A gesture is a run of scroll events with no real gap in it — one flick
     * and its coasting. A quiet moment starts a fresh one, and with it a fresh
     * allowance.
     */
    const now = performance.now();
    if (now - lastScrollAt.current > DECK_MOTION.gestureGap)
      turnedThisScroll.current = 0;
    lastScrollAt.current = now;

    /**
     * Scroll picks the card, it does not scrub the shuffle. The raw position
     * is only consulted to decide whether we have gone far enough into the
     * next card to commit to it; the move itself is then played out by a
     * spring in the media layer. The threshold is measured against the card we
     * are committed to rather than by rounding, so the deck does not flip back
     * and forth on the boundary, and the loop covers a fast scroll crossing
     * several cards inside one event.
     */
    const raw = Math.max(0, (top - cfg.intro - cfg.hold) / cfg.step);
    const before = pTarget.get();
    let committed = before;
    while (raw >= committed + DECK_MOTION.commit && committed < n) committed += 1;
    while (raw <= committed - DECK_MOTION.commit && committed > 0) committed -= 1;

    /**
     * One scroll turns through a limited number of cards. Without this a hard
     * flick carries the deck round the whole list and out the other side, and
     * it reads as a slot machine rather than as a deck being looked through.
     */
    const wanted = Math.abs(committed - before);
    if (wanted > 0) {
      const left = Math.max(
        0,
        DECK_MOTION.maxPerGesture - turnedThisScroll.current,
      );
      if (wanted > left)
        committed = before + Math.sign(committed - before) * left;
      turnedThisScroll.current += Math.abs(committed - before);
    }

    /**
     * A full turn behind us: rewind a lap so scrolling can carry on for ever.
     *
     * The committed card is rewound along with the scroller and the animation.
     * Rewinding only the other two used to leave this one a whole lap ahead,
     * and the next scroll event then read that gap as six cards of travel in
     * the opposite direction — which both jerked the deck and spent an
     * allowance that had not been used, letting a gesture run past its limit.
     */
    if (committed >= n) {
      committed -= n;
      el.scrollTop -= lap;
      rebaseDeck(1);
    }

    /**
     * Out of allowance: hold the scroller on the card the deck stopped at,
     * which absorbs the rest of the momentum. Letting it coast on would leave
     * the scroll position pointing at a card the deck never reached.
     */
    if (turnedThisScroll.current >= DECK_MOTION.maxPerGesture) {
      const pin = deckTop(committed);
      if (Math.abs(el.scrollTop - pin) > 1) el.scrollTop = pin;
    }

    pTarget.set(committed);
  }, [
    pTarget,
    pi,
    n,
    lap,
    cfg.intro,
    cfg.hold,
    cfg.step,
    deckDriven,
    rebaseDeck,
    deckTop,
  ]);

  /**
   * Let a fling put the scroller where the card landed.
   *
   * Written directly rather than through `scrollTo`, and with the scroll
   * handler already suppressed, so this repositions the scroller silently
   * instead of kicking off a second animation that would fight the spring.
   */
  useEffect(() => {
    registerDeckScroll((value: number) => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTop = deckTop(value);
    });
    return () => registerDeckScroll(null);
  }, [registerDeckScroll, deckTop]);

  useMotionValueEvent(p, "change", (v) => {
    // Remember on every change rather than on click, so leaving by the browser
    // back button restores the deck just as well as the return links do.
    rememberDeck(v);
    const next = frontIndex(v, n);
    setFront((prev) => (prev === next ? prev : next));
  });

  // Returning from a project page restores the deck rather than resetting it
  // to the first card.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || stage.h === 0) return;
    const remembered = restoreDeck();
    if (remembered !== null) pTarget.set(Math.round(remembered));
    el.scrollTop = remembered === null ? 0 : deckTop(remembered);
    onScroll();
    // Only on mount and when the stage is first measured.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage.h === 0]);

  const jumpTo = useCallback(
    (i: number) => {
      const el = scrollRef.current;
      if (!el) return;
      /**
       * The deck is a ring, so there are two ways to reach any project and
       * this picks the shorter one.
       *
       * A short hop back just reverses — for a card or two that reads as
       * undoing the last move. Anything further carries on FORWARDS instead
       * and wraps around, which is the motion the deck is built around: cards
       * leaving the front and slotting in behind. Running that in reverse
       * three or four times over is what made a jump back across the deck look
       * busy.
       */
      const current = Math.round(pTarget.get());
      const back = (((current - i) % n) + n) % n;
      const forward = (((i - current) % n) + n) % n;
      if (back === 0) return;

      if (back <= DECK_MOTION.reverseMax) {
        el.scrollTo({
          top: deckTop(i),
          behavior: reduced ? "auto" : "smooth",
        });
        return;
      }

      /**
       * Going the long way round means the deck position runs past the end of
       * its range, so the scroller cannot carry it — the media layer drives it
       * and rebases once it arrives. A position and that position plus a full
       * lap are identical on screen, since depth is measured around the ring,
       * so the rebase is invisible.
       */
      deckDriven.current = true;
      pTarget.set(current + forward);
    },
    [deckTop, reduced, pTarget, deckDriven, n],
  );

  // Hero drifts away as the deck arrives. Driven straight off the intro
  // progress, so no re-render happens while scrolling.
  const heroOpacity = useTransform(pi, (v) => Math.max(0, 1 - v * 1.9));
  const heroX = useTransform(pi, (v) => (mobile || reduced ? 0 : -v * 150));
  const heroY = useTransform(pi, (v) => (reduced ? 0 : -v * (mobile ? 34 : 44)));
  const chromeOpacity = useTransform(pi, (v) => clamp01((v - 0.45) * 2.2));

  const s = stage.s;
  const ts = stage.ts;

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="no-scrollbar"
      style={{
        position: "fixed",
        inset: 0,
        overflowY: "auto",
        overflowX: "hidden",
        // `proximity` rather than `mandatory`: the deck is a scrubber, and
        // mandatory snapping fights a scroll that is mid-shuffle.
        scrollSnapType: "y proximity",
        WebkitOverflowScrolling: "touch",
      }}
    >
      <div style={{ position: "relative", height: scrollHeight }}>
        <div
          style={{
            position: "sticky",
            top: 0,
            height: "100svh",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "relative",
              width: stage.w || "100%",
              height: "100%",
              margin: "0 auto",
            }}
          >
            <Header variant="home" />

            <motion.div
              style={{
                position: "absolute",
                left: mobile ? 24 : 0,
                right: mobile ? 24 : 0,
                top: stageY(stage, mobile ? 132 : 176),
                zIndex: 52,
                display: "flex",
                justifyContent: "center",
                opacity: heroOpacity,
                x: heroX,
                y: heroY,
                pointerEvents: "none",
              }}
            >
              <h1
                style={{
                  margin: 0,
                  maxWidth: mobile ? "none" : 760 * ts,
                  textAlign: "center",
                  fontFamily: "var(--font-display)",
                  fontWeight: 400,
                  fontSize: (mobile ? 26 : 42) * ts,
                  lineHeight: mobile ? 1.28 : `${50.81 * ts}px`,
                  letterSpacing: mobile ? "-0.026em" : "-0.03em",
                  textWrap: "pretty",
                }}
              >
                Hey, I&rsquo;m Remington and I make software come to life with
                motion.
              </h1>
            </motion.div>

            {mobile ? (
              <motion.div
                style={{
                  position: "absolute",
                  left: 24,
                  right: 24,
                  bottom: stage.top + 36 * s,
                  zIndex: 56,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 9,
                  textAlign: "center",
                  opacity: chromeOpacity,
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 400,
                    fontSize: 22 * ts,
                    lineHeight: 1.14,
                    letterSpacing: "-0.026em",
                  }}
                >
                  {projects[front].title}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9.5 * ts,
                    lineHeight: 1,
                    letterSpacing: "0.11em",
                    opacity: 0.42,
                  }}
                >
                  {projects[front].year}
                </div>
                <div style={{ paddingTop: 6 }}>
                  <Ticks
                    count={n}
                    active={front}
                    onJump={jumpTo}
                    labels={(i) => `Go to ${projects[i].title}`}
                  />
                </div>
              </motion.div>
            ) : (
              <motion.div
                style={{
                  position: "absolute",
                  // Tucked further out than the authored 120 so the ledger and
                  // the deck stop crowding each other.
                  left: 76 * ts,
                  top: "50%",
                  y: "-50%",
                  zIndex: 56,
                  opacity: chromeOpacity,
                }}
              >
                <Ledger front={front} onJump={jumpTo} />
              </motion.div>
            )}
          </div>
        </div>

        {/*
          Snap markers, placed at exact offsets: one for the hero, then one per
          project. Deliberately not flex children — as flex items they get
          shrunk to fit the wrapper, which silently moves every snap point.
        */}
        <div aria-hidden style={{ pointerEvents: "none" }}>
          {Array.from({ length: 2 * n + 1 }, (_, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                left: 0,
                width: 1,
                height: 1,
                top: i === 0 ? 0 : deckTop(i - 1),
                scrollSnapAlign: "start",
              }}
            />
          ))}
        </div>
      </div>

      {/*
        The deck is the visual navigation, but only the front card is clickable.
        These links give crawlers and assistive technology direct access to
        every project without altering the design.
      */}
      <nav className="sr-only" aria-label="All projects">
        <ul>
          {projects.map((project) => (
            <li key={project.slug}>
              <Link href={`/work/${project.slug}`}>
                {project.title} — {project.year}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
