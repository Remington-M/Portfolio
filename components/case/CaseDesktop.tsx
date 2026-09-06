"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, useMotionValueEvent, useTransform, useReducedMotion } from "motion/react";
import { useStage } from "@/components/media/stage";
import Header from "@/components/Header";
import Ticks from "@/components/Ticks";
import {
  CASE,
  HOUSE,
  HOUSE_CSS,
  SHADOW,
  SPRING,
  TYPE,
  type as typeStyle,
} from "@/lib/design";
import {
  caseBaseline,
  caseCaption,
  caseScrollHeight,
  ghostCards,
  returnProgress,
  stageY,
} from "@/lib/geometry";
import { clamp, clamp01 } from "@/lib/spring";
import { titleLines, type Project } from "@/lib/projects";

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
  const lines = titleLines(project);

  /**
   * One element of the intro arriving: up and in, `step` places down the order.
   *
   * The title is the first of them now. It briefly travelled from the ledger
   * instead — a shared element — which meant the two ends had to agree on
   * their line breaks, and a break chosen for a 56px headline is not the one
   * that suits a row in a list. Forcing them to agree cost more than the
   * continuity was worth, so the headline simply arrives with everything else.
   *
   * Spread rather than wrapped in a component so each element keeps its own
   * `style` — these are laid out by the column they sit in, and putting a
   * wrapper around each one would change that layout to animate it.
   */
  const rise = (step: number) =>
    reduced
      ? {}
      : {
          initial: { opacity: 0, y: CASE.enter.rise * stage.s },
          animate: { opacity: 1, y: 0 },
          transition: {
            duration: CASE.enter.ms / 1000,
            delay: (CASE.enter.lead + step * CASE.enter.stagger) / 1000,
            ease: [...HOUSE] as [number, number, number, number],
          },
        };

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

            {/*
              Screen 01 — intro.

              Keyed on the project so the arrival sequence below replays for
              each one. Without it the column mounts once and every project
              after the first would find its type already in place.
            */}
            <motion.div
              key={project.slug}
              style={{
                position: "absolute",
                left: CASE.intro.rail * stage.sx,
                top: stageY(stage, 214),
                width: CASE.intro.colWidth * ts,
                zIndex: 54,
                opacity: introOpacity,
                y: introY,
              }}
            >
              <motion.h1
                {...rise(0)}
                style={{
                  margin: 0,
                  ...typeStyle(TYPE.display, ts),
                  color: "var(--ink)",
                  textWrap: "pretty",
                }}
              >
                {lines.map((line, i) => (
                  <span key={i} style={{ display: "block" }}>
                    {line}
                  </span>
                ))}
              </motion.h1>
              <motion.div
                {...rise(1)}
                style={{
                  ...typeStyle(TYPE.body, ts),
                  color: "var(--ink-2)",
                  paddingTop: 26 * ts,
                  textWrap: "pretty",
                  whiteSpace: "pre-line",
                }}
              >
                {project.overview}
              </motion.div>
              {/*
                The rule, drawn from its middle outwards.

                Its own element rather than a `border-top`, because a border
                cannot be transformed — it can only fade, and a line that fades
                up at full width is a line that was already there. Scaling from
                the centre is the difference between a rule appearing and a
                rule being drawn.
              */}
              <motion.div
                aria-hidden
                initial={reduced ? false : { scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{
                  duration: CASE.enter.ruleMs / 1000,
                  delay: (CASE.enter.lead + 2 * CASE.enter.stagger) / 1000,
                  ease: [...HOUSE] as [number, number, number, number],
                }}
                style={{
                  height: 1,
                  marginTop: 34 * ts,
                  background: "var(--rule)",
                  transformOrigin: "50% 50%",
                }}
              />
              <motion.dl
                {...rise(3)}
                style={{
                  display: "flex",
                  gap: 32 * ts,
                  margin: 0,
                  padding: `${26 * ts}px 0 0`,
                  ...typeStyle(TYPE.value, ts),
                  color: "var(--ink-2)",
                }}
              >
                {/* Role is deliberately absent — it never varies across
                    projects and belongs on the About page. */}
                <div style={{ flex: "0 0 auto" }}>
                  <dt style={{ ...typeStyle(TYPE.label, ts), color: "var(--ink-3)" }}>
                    YEAR
                  </dt>
                  <dd style={{ margin: 0 }}>{project.yearLong ?? project.year}</dd>
                </div>
                <div style={{ flex: `1 1 ${190 * ts}px`, minWidth: 0 }}>
                  <dt style={{ ...typeStyle(TYPE.label, ts), color: "var(--ink-3)" }}>
                    COLLABORATORS
                  </dt>
                  <dd style={{ margin: 0 }}>{project.collaborators}</dd>
                </div>
              </motion.dl>
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
                      boxShadow: SHADOW.cardBack,
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
                  ...typeStyle(TYPE.label, ts),
                  color: "var(--ink-3)",
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
                  ...typeStyle(TYPE.numeral, ts),
                  color: "var(--ink-3)",
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
  /**
   * The arrows are horizontal furniture, so their SIZE comes off the
   * horizontal scale as well as their inset.
   *
   * Splitting the two put the lane's outer edge on `sx` and its inner edge on
   * `s`, so a taller window grew the mark inward while the frame beside it
   * stayed put — the clearance between them fell from 25px to 12px purely
   * because the window got taller. On one scale the lane is invariant.
   */
  const s = stage.sx;
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
        [side]: CASE.arrowInset * s,
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
      /**
       * Sideways, and in the same direction as the picture: a title for a shot
       * already passed leaves to the left, one not yet reached waits on the
       * right — which is exactly where its clip is.
       */
      animate={{
        opacity: on ? 1 : 0,
        x: on ? 0 : (active > index ? -1 : 1) * CASE.titleShift * stage.s,
      }}
      transition={SPRING.title}
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
          ...typeStyle(TYPE.titleM, ts),
          color: "var(--ink)",
          textWrap: "pretty",
        }}
      >
        {title}
      </div>
      <div
        style={{
          paddingTop: 9 * ts,
          ...typeStyle(TYPE.label, ts),
          color: "var(--ink-3)",
        }}
      >
        {meta}
      </div>
    </motion.div>
  );
}
