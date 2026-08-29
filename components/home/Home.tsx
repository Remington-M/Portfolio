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
  } = useStage();
  const reduced = useReducedMotion() ?? false;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [front, setFront] = useState(() => frontIndex(p.get(), projects.length));

  const cfg = mobile ? DECK.mobile : DECK.desktop;
  const n = projects.length;

  // Max scrollTop works out to exactly `intro + hold + n * step`, so the last
  // card can complete its shuffle rather than stopping half way through the arc.
  const scrollHeight = cfg.intro + cfg.hold + n * cfg.step + stage.h;

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
     * Scroll picks the card, it does not scrub the shuffle.
     *
     * The raw position is only consulted to decide whether we have gone far
     * enough into the next card to commit to it; the move itself is then
     * played out by a spring in the media layer. Scrubbing the arc directly
     * meant a slow scroll could park a card half way round the stack and hold
     * it there, which read as the animation stalling rather than as control.
     *
     * The threshold is applied against the card we are currently committed to
     * rather than by rounding, so the deck does not flip back and forth while
     * the pointer hovers on the boundary. The loop covers a fast scroll that
     * crosses several cards inside one event.
     */
    // The deck does not start moving until the dwell is behind us.
    const raw = Math.max(0, (top - cfg.intro - cfg.hold) / cfg.step);
    let committed = pTarget.get();
    while (raw >= committed + DECK_MOTION.commit && committed < n) committed += 1;
    while (raw <= committed - DECK_MOTION.commit && committed > 0) committed -= 1;
    pTarget.set(committed);
  }, [pTarget, pi, n, cfg.intro, cfg.hold, cfg.step, deckDriven]);

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
      el.scrollTo({
        top: deckTop(i),
        behavior: reduced ? "auto" : "smooth",
      });
    },
    [deckTop, reduced],
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
                  left: 120 * ts,
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
          {Array.from({ length: n + 1 }, (_, i) => (
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
