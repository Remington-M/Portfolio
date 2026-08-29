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
import { DECK } from "@/lib/design";
import { clamp01 } from "@/lib/spring";
import { frontIndex } from "@/lib/geometry";

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
  const { p, pi, stage, mobile, restoreDeck, rememberDeck } = useStage();
  const reduced = useReducedMotion() ?? false;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [front, setFront] = useState(() => frontIndex(p.get(), projects.length));

  const cfg = mobile ? DECK.mobile : DECK.desktop;
  const n = projects.length;

  // Max scrollTop works out to exactly `intro + n * step`, so the last card can
  // complete its shuffle rather than stopping half way through the arc.
  const scrollHeight = cfg.intro + n * cfg.step + stage.h;

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const top = el.scrollTop;
    p.set(Math.max(0, (top - cfg.intro) / cfg.step));
    pi.set(Math.min(1, top / cfg.intro));
  }, [p, pi, cfg.intro, cfg.step]);

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
    el.scrollTop = remembered === null ? 0 : cfg.intro + remembered * cfg.step;
    onScroll();
    // Only on mount and when the stage is first measured.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage.h === 0]);

  const jumpTo = useCallback(
    (i: number) => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTo({
        top: cfg.intro + i * cfg.step,
        behavior: reduced ? "auto" : "smooth",
      });
    },
    [cfg.intro, cfg.step, reduced],
  );

  // Hero drifts away as the deck arrives. Driven straight off the intro
  // progress, so no re-render happens while scrolling.
  const heroOpacity = useTransform(pi, (v) => Math.max(0, 1 - v * 1.9));
  const heroX = useTransform(pi, (v) => (mobile || reduced ? 0 : -v * 150));
  const heroY = useTransform(pi, (v) => (reduced ? 0 : -v * (mobile ? 34 : 44)));
  const chromeOpacity = useTransform(pi, (v) => clamp01((v - 0.45) * 2.2));

  const s = stage.s;

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
                top: (mobile ? 132 : 176) * s,
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
                  maxWidth: mobile ? "none" : 760,
                  textAlign: "center",
                  fontFamily: "var(--font-display)",
                  fontWeight: 400,
                  fontSize: mobile ? 26 : 42,
                  lineHeight: mobile ? 1.28 : "50.81px",
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
                  bottom: 36 * s,
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
                    fontSize: 22,
                    lineHeight: 1.14,
                    letterSpacing: "-0.026em",
                  }}
                >
                  {projects[front].title}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9.5,
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
                  left: 120,
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
                top: i === 0 ? 0 : cfg.intro + (i - 1) * cfg.step,
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
