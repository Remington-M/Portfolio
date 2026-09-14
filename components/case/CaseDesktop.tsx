"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useMotionValueEvent, useTransform, useReducedMotion, type MotionValue } from "motion/react";
import { useStage } from "@/components/media/stage";
import Header from "@/components/Header";
import Ticks from "@/components/Ticks";
import {
  CASE,
  HOUSE,
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
import { heroSpring } from "@/lib/heroTuning";
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
  const { cp, stage, viewer } = useStage();
  const reduced = useReducedMotion() ?? false;
  const scrollRef = useRef<HTMLDivElement>(null);

  // Shot 01 is the intro screen; the project's own shots follow.
  const shotCount = project.shots.length + 1;
  const router = useRouter();
  /** Set by the back link: fade the column, then leave. */
  const [leaving, setLeaving] = useState(false);
  /* The route changes on a clock matched to the fade, not on the fade's
   * completion callback: a background tab suspends animation frames and a
   * navigation that waited on one would never happen. */
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => router.push("/"), reduced ? 0 : CASE.leave.fade);
    return () => clearTimeout(t);
  }, [leaving, router, reduced]);
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
  const rise = (step: number) => {
    if (reduced) return {};
    const delay = (CASE.enter.lead + step * CASE.enter.stagger) / 1000;
    return {
      initial: { opacity: 0, y: CASE.enter.rise * stage.s },
      animate: { opacity: 1, y: 0 },
      transition: {
        y: { ...heroSpring(CASE.enter.stiffness, CASE.enter.ratio, CASE.enter.mass), delay },
        opacity: { duration: CASE.enter.fade / 1000, ease: "linear" as const, delay },
      },
    };
  };

  /**
   * The arrows sit off the viewer's LIVE box, published by the layer from
   * the card's own springs, so they move exactly as the container does —
   * the same overshoot, the same settle — rather than on a spring of their
   * own tuned to look like it. On the intro screen the viewer runs out to
   * the right rail, so the next arrow is held at the edge of the stage
   * instead, in the margin; the previous arrow has nowhere to go there and
   * is not shown.
   */
  const arrowSize = 56 * stage.sx;
  const arrowGap = CASE.arrowGap * stage.sx;
  const arrowLeftX = useTransform(viewer.x, (x: number) => x - arrowGap - arrowSize);
  const arrowRightX = useTransform([viewer.x, viewer.w], ([x, w]) =>
    Math.min((x as number) + (w as number) + arrowGap, stage.w - arrowSize - 4 * stage.sx),
  );
  const arrowTopY = useTransform([viewer.y, viewer.h], ([y, h]) =>
    (y as number) + (h as number) / 2 - arrowSize / 2,
  );

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="no-scrollbar"
      style={{
        position: "fixed",
        inset: 0,
        overflowY: "auto",
        // Same as the home page: no rubber-band dragging the header.
        overscrollBehaviorY: "none",
        overflowX: "hidden",
        /**
         * One shot per gesture.
         *
         * Scroll position maps straight to shot position here, so a trackpad
         * flick carries several hundred pixels of momentum and lands two or
         * three shots along — you throw the page and find out afterwards where
         * it stopped. `scroll-snap-stop: always` on each shot is the native
         * answer: momentum is not allowed to cross a snap point, so a flick of
         * any strength advances exactly one and the next needs another.
         *
         * The deck solves the same problem with its own gesture accounting
         * (`DECK_MOTION.maxPerGesture`) because it is animating a ring rather
         * than scrolling a document. Here the scroller IS the state, so the
         * scroller's own mechanism is the right one.
         */
        scrollSnapType: "y mandatory",
      }}
    >
      <div style={{ position: "relative", height: caseScrollHeight(shotCount) }}>
        {/*
          The snap points: one per shot, plus one where the return-to-deck
          ending finishes. Zero-width markers rather than snapping the sticky
          stage itself, which is one element that never moves and so has no
          per-shot position to snap to.

          The ending gets one so a flick off the last shot arrives somewhere
          deliberate instead of part-way through the return.
        */}
        {Array.from({ length: shotCount }, (_, i) => (
          <div
            key={i}
            aria-hidden
            style={{
              position: "absolute",
              top: CASE.offset + i * CASE.step,
              left: 0,
              width: 1,
              height: 1,
              scrollSnapAlign: "start",
              scrollSnapStop: "always",
              pointerEvents: "none",
            }}
          />
        ))}
        <div
          aria-hidden
          style={{
            position: "absolute",
            top:
              CASE.offset +
              (shotCount - 1 + CASE.returnSpan) * CASE.step,
            left: 0,
            width: 1,
            height: 1,
            scrollSnapAlign: "start",
            scrollSnapStop: "always",
            pointerEvents: "none",
          }}
        />
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
            {/* No project name up here: the headline below says it. */}
            <Header variant="case" onBack={() => setLeaving(true)} />

            {/*
              Screen 01 — intro.

              Keyed on the project so the arrival sequence below replays for
              each one. Without it the column mounts once and every project
              after the first would find its type already in place.
            */}
            <motion.div
              /**
               * The way back: the column fades out, linear and quick, and
               * only then does the route change and the card fly home. A
               * stacking context of its own so it stays above the viewer
               * while it is translucent.
               */
              animate={{ opacity: leaving ? 0 : 1 }}
              transition={{ duration: CASE.leave.fade / 1000, ease: "linear" }}
              style={{ position: "relative", zIndex: 54 }}
            >
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
              <motion.div {...rise(2)} aria-hidden style={{ marginTop: 34 * ts }}>
                <motion.div
                  initial={reduced ? false : { scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{
                    duration: CASE.enter.ruleMs / 1000,
                    delay: (CASE.enter.lead + 2 * CASE.enter.stagger) / 1000,
                    ease: [...HOUSE] as [number, number, number, number],
                  }}
                  style={{
                    height: 1,
                    background: "var(--rule)",
                    transformOrigin: "50% 50%",
                  }}
                />
              </motion.div>
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
                // The title's own line box. It was 56, which left room for a
                // meta line that is no longer set beneath it.
                height: 32 * ts,
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
                x={arrowLeftX}
                y={arrowTopY}
                onClick={() => jump(Math.max(0, active - 1))}
              />
              <StepArrow
                side="right"
                label="Next shot"
                disabled={active >= shotCount - 1}
                x={arrowRightX}
                y={arrowTopY}
                onClick={() => jump(Math.min(shotCount - 1, active + 1))}
              />
            </motion.div>

            <motion.div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: stage.top + CASE.ticksInset * s,
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
  x,
  y,
  onClick,
}: {
  side: "left" | "right";
  label: string;
  disabled: boolean;
  /** Top-left of the hit area, stage px, live from the viewer's box. */
  x: MotionValue<number>;
  y: MotionValue<number>;
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
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-hidden={disabled || undefined}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      initial={false}
      // Gone when there is nowhere to go; faint at rest, definite on approach.
      animate={{ opacity: disabled ? 0 : hover ? 0.8 : 0.34 }}
      transition={{ opacity: { duration: 0.3, ease: [...HOUSE] as [number, number, number, number] } }}
      style={{
        position: "absolute",
        left: x,
        top: y,
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
        pointerEvents: disabled ? "none" : "auto",
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
    </motion.button>
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
}: {
  index: number;
  active: number;
  title: string;
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
    </motion.div>
  );
}
