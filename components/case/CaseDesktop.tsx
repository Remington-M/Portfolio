"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { motion, useMotionValueEvent, useTransform, useReducedMotion } from "motion/react";
import { useStage } from "@/components/media/stage";
import Header from "@/components/Header";
import Ticks from "@/components/Ticks";
import { CASE, SHADOW } from "@/lib/design";
import {
  caseBaseline,
  caseScrollHeight,
  ghostCards,
  returnProgress,
  stageY,
} from "@/lib/geometry";
import { clamp, clamp01 } from "@/lib/spring";
import type { Project } from "@/lib/projects";

/**
 * Desktop project page.
 *
 * One shot per 780px of scroll. The device frame is not rendered here — it is
 * the deck card, still in the persistent media layer, retargeted to this page's
 * geometry. What lives here is everything around it: the intro text, the shot
 * titles, the progress ticks and the return-to-deck ending.
 */
export default function CaseDesktop({ project }: { project: Project }) {
  const { cp, stage } = useStage();
  const reduced = useReducedMotion() ?? false;
  const scrollRef = useRef<HTMLDivElement>(null);

  // Shot 01 is the intro screen; the project's own shots follow.
  const shotCount = project.shots.length + 1;
  const [active, setActive] = useState(() =>
    clamp(Math.round(cp.get()), 0, project.shots.length),
  );

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    cp.set(Math.max(0, (el.scrollTop - CASE.offset) / CASE.step));
  }, [cp]);

  useMotionValueEvent(cp, "change", (v) => {
    const next = clamp(Math.round(v), 0, shotCount - 1);
    setActive((prev) => (prev === next ? prev : next));
  });

  const jump = useCallback(
    (i: number) => {
      scrollRef.current?.scrollTo({
        top: CASE.offset + i * CASE.step,
        behavior: reduced ? "auto" : "smooth",
      });
    },
    [reduced],
  );

  const s = stage.s;
  const ts = stage.ts;
  const baseline = caseBaseline(stage);

  const introOpacity = useTransform(cp, (v) => clamp01(1 - Math.abs(v) * 1.9));
  const introY = useTransform(cp, (v) => (reduced ? 0 : -v * 44));
  const ret = useTransform(cp, (v) => returnProgress(v, shotCount));
  const chromeOpacity = useTransform(ret, (r) => 1 - Math.min(1, r * 2.2));
  const returnOpacity = useTransform(ret, (r) => clamp01((r - 0.55) / 0.45));
  const returnY = useTransform(ret, (r) => (reduced ? 0 : (1 - r) * 16));

  const [ghostR, setGhostR] = useState(0);
  useMotionValueEvent(ret, "change", (r) => {
    // The ghost fan only exists during the ending, so re-rendering it at a
    // coarse step costs nothing and keeps the frame loop free of layout work.
    const q = Math.round(r * 30) / 30;
    setGhostR((prev) => (prev === q ? prev : q));
  });

  const kicker = `${project.title} · ${project.yearLong ?? project.year}`.toUpperCase();
  const titleLines = project.displayTitle ?? [project.title];

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
      }}
    >
      <div style={{ position: "relative", height: caseScrollHeight(shotCount) }}>
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
            <Header variant="case" kicker={kicker} />

            {/* Screen 01 — intro. */}
            <motion.div
              style={{
                position: "absolute",
                left: 120 * ts,
                top: stageY(stage, 214),
                width: 500 * ts,
                maxWidth: 470 * ts,
                zIndex: 54,
                opacity: introOpacity,
                y: introY,
              }}
            >
              <h1
                style={{
                  margin: 0,
                  fontFamily: "var(--font-display)",
                  fontWeight: 400,
                  fontSize: 56 * ts,
                  lineHeight: 1.02,
                  letterSpacing: "-0.04em",
                }}
              >
                {titleLines.map((line, i) => (
                  <span key={i} style={{ display: "block" }}>
                    {line}
                  </span>
                ))}
              </h1>
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 400,
                  fontSize: 18 * ts,
                  lineHeight: 1.55,
                  opacity: 0.66,
                  paddingTop: 26 * ts,
                  textWrap: "pretty",
                  whiteSpace: "pre-line",
                }}
              >
                {project.overview}
              </div>
              <dl
                style={{
                  display: "flex",
                  gap: 32 * ts,
                  margin: `${34 * ts}px 0 0`,
                  padding: `${26 * ts}px 0 0`,
                  borderTop: "1px solid var(--hairline)",
                  fontFamily: "var(--font-mono)",
                  fontWeight: 400,
                  fontSize: 9.5 * ts,
                  lineHeight: 1.8,
                  letterSpacing: "0.06em",
                }}
              >
                {/* Role is deliberately absent — it never varies across
                    projects and belongs on the About page. */}
                <div style={{ flex: "0 0 auto" }}>
                  <dt style={{ opacity: 0.42 }}>YEAR</dt>
                  <dd style={{ margin: 0 }}>{project.yearLong ?? project.year}</dd>
                </div>
                <div style={{ flex: `1 1 ${190 * ts}px`, minWidth: 0 }}>
                  <dt style={{ opacity: 0.42 }}>COLLABORATORS</dt>
                  <dd style={{ margin: 0 }}>{project.collaborators}</dd>
                </div>
              </dl>
            </motion.div>

            {/* Ghost cards fanning out behind the frame as it becomes a card. */}
            {ghostR > 0 ? (
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 51,
                  pointerEvents: "none",
                }}
              >
                {ghostCards(ghostR, stage).map((g) => (
                  <div
                    key={g.key}
                    style={{
                      position: "absolute",
                      left: "50%",
                      top: g.top,
                      width: g.w,
                      height: g.h,
                      borderRadius: g.radius,
                      background: "var(--ghost)",
                      boxShadow: SHADOW.ghost,
                      opacity: g.opacity,
                      transform: `translateX(calc(-50% + ${g.dx}px)) translateY(${g.dy}px) rotate(${g.rotate}deg) scale(${g.scale})`,
                    }}
                  />
                ))}
              </div>
            ) : null}

            {/* Shot titles. Only one is visible at a time. */}
            <motion.div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: baseline + 26 * s,
                height: 56 * ts,
                zIndex: 56,
                textAlign: "center",
                opacity: chromeOpacity,
              }}
            >
              {project.shots.map((shot, i) => (
                <ShotTitle key={shot.n} index={i + 1} title={shot.title} meta={shot.meta} />
              ))}
            </motion.div>

            <motion.div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: baseline + 1 * s,
                zIndex: 60,
                textAlign: "center",
                opacity: returnOpacity,
                y: returnY,
              }}
            >
              <Link
                href="/"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10 * ts,
                  letterSpacing: "0.14em",
                  opacity: 0.55,
                }}
              >
                RETURN TO WORK
              </Link>
            </motion.div>

            <motion.div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: stage.top + 46 * s,
                zIndex: 70,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12 * ts,
                opacity: chromeOpacity,
              }}
            >
              <Ticks
                count={shotCount}
                active={active}
                onJump={jump}
                labels={(i) =>
                  i === 0 ? "Project overview" : `Shot ${i} of ${shotCount - 1}`
                }
              />
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9 * ts,
                  letterSpacing: "0.12em",
                  opacity: 0.34,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {String(active + 1).padStart(2, "0")} /{" "}
                {String(shotCount).padStart(2, "0")}
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** A single shot title, crossfading and sliding with the scroll. */
function ShotTitle({
  index,
  title,
  meta,
}: {
  index: number;
  title: string;
  meta: string;
}) {
  const { cp, stage } = useStage();
  const ts = stage.ts;
  const opacity = useTransform(cp, (v) =>
    clamp01(1 - Math.abs(v - index) * 2.4),
  );
  const y = useTransform(cp, (v) => (v - index) * 26 * stage.s);

  return (
    <motion.div
      style={{ position: "absolute", left: 0, right: 0, top: 0, opacity, y }}
    >
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 400,
          fontSize: 26 * ts,
          lineHeight: 1.14,
          letterSpacing: "-0.028em",
        }}
      >
        {title}
      </div>
      <div
        style={{
          paddingTop: 9 * ts,
          fontFamily: "var(--font-mono)",
          fontSize: 9.5 * ts,
          lineHeight: 1,
          letterSpacing: "0.11em",
          opacity: 0.4,
        }}
      >
        {meta}
      </div>
    </motion.div>
  );
}
