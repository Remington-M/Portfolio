"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, useMotionValueEvent, useTransform, useReducedMotion } from "motion/react";
import { useStage } from "@/components/media/stage";
import Header from "@/components/Header";
import Ticks from "@/components/Ticks";
import { CASE, HOUSE_CSS, SHADOW, SPRING } from "@/lib/design";
import {
  caseBaseline,
  caseCaption,
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
  // Shots are centred now, so the caption has its own line rather than sitting
  // a fixed distance under a shared bottom edge.
  const caption = caseCaption(stage);

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

  /**
   * Arrow keys step through the shots.
   *
   * The arrows and the scroll both exist, but neither is reachable from the
   * keyboard — and this page is a sequence, which is exactly the shape a
   * keyboard expects to be able to walk. Home and End go to the ends, since
   * fourteen shots is a long way to hold an arrow key down.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      // Leave typing and activating alone.
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)))
        return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const last = shotCount - 1;
      const at = clamp(Math.round(cp.get()), 0, last);
      let next: number | null = null;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") next = Math.min(last, at + 1);
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = Math.max(0, at - 1);
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = last;
      if (next === null || next === at) return;
      e.preventDefault();
      jump(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cp, jump, shotCount]);

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
                top: caption,
                height: 56 * ts,
                zIndex: 56,
                textAlign: "center",
                opacity: chromeOpacity,
              }}
            >
              {project.shots.map((shot, i) => (
                <ShotTitle
                  key={shot.n}
                  index={i + 1}
                  active={active}
                  title={shot.title}
                  meta={shot.meta}
                />
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

            {/*
              Step arrows.

              Scrolling is the real control, but nothing on the page says so —
              a viewer sitting still with a caption under it looks like a
              picture, not like something you move through. These are the
              affordance: quiet enough to stay out of the way, present enough
              that the page reads as steppable at a glance. They persist rather
              than appearing on hover, since a control you have to discover by
              hovering solves nothing for the person who did not know to look.
            */}
            <motion.div style={{ opacity: chromeOpacity }}>
              <StepArrow
                side="left"
                label="Previous shot"
                disabled={active === 0}
                onClick={() => jump(Math.max(0, active - 1))}
              />
              <StepArrow
                side="right"
                label="Next shot"
                disabled={active >= shotCount - 1}
                onClick={() => jump(Math.min(shotCount - 1, active + 1))}
              />
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

/**
 * One of the two step arrows. Hit area is generous; the mark inside it is not.
 */
function StepArrow({
  side,
  label,
  disabled,
  onClick,
}: {
  side: "left" | "right";
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  const { stage } = useStage();
  const s = stage.s;
  const [hover, setHover] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      style={{
        position: "absolute",
        [side]: 34 * s,
        top: "50%",
        transform: "translateY(-50%)",
        zIndex: 62,
        width: 56 * s,
        height: 56 * s,
        display: "grid",
        placeItems: "center",
        border: 0,
        borderRadius: "50%",
        background: "none",
        color: "var(--ink)",
        cursor: disabled ? "default" : "pointer",
        // Faint at rest, definite on approach, gone when there is nowhere to go.
        opacity: disabled ? 0.12 : hover ? 0.8 : 0.34,
        transition: `opacity .3s ${HOUSE_CSS}`,
        padding: 0,
      }}
    >
      <svg
        width={22 * s}
        height={22 * s}
        viewBox="0 0 22 22"
        fill="none"
        aria-hidden
      >
        <path
          d={side === "left" ? "M13.5 4L6.5 11l7 7" : "M8.5 4l7 7-7 7"}
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

/**
 * A single shot title.
 *
 * Changes on the shot rather than under the scroll. Driven from the scroll
 * position it was continuously part-way between two titles — both half
 * visible, both half moved — which reads as neither. Like the viewer's morph,
 * this is a move between two settled states, and the in-between is somewhere
 * it passes through rather than somewhere it sits.
 */
function ShotTitle({
  index,
  active,
  title,
  meta,
}: {
  index: number;
  active: number;
  title: string;
  meta: string;
}) {
  const { stage } = useStage();
  const ts = stage.ts;
  const on = active === index;

  return (
    <motion.div
      initial={false}
      animate={{ opacity: on ? 1 : 0, y: on ? 0 : (active > index ? -14 : 14) * stage.s }}
      transition={SPRING.morph}
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 0,
        // Only the one on screen can be reached or read out.
        pointerEvents: "none",
        visibility: on ? "visible" : "hidden",
      }}
      aria-hidden={!on}
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
