"use client";

import { useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, useTransform, useReducedMotion } from "motion/react";
import { useStage } from "@/components/media/stage";
import Header from "@/components/Header";
import { CASE, SHADOW } from "@/lib/design";
import { railPadding, railPitch } from "@/lib/geometry";
import { clamp01 } from "@/lib/spring";
import type { Project } from "@/lib/projects";

/**
 * Mobile project page.
 *
 * A horizontal snap carousel. The axis split is deliberate and load-bearing:
 * vertical moves between projects on the home deck, horizontal between shots
 * here. Two levels of hierarchy, two gestures — don't collapse them.
 *
 * The first card is a spacer. The card the viewer actually sees in that slot is
 * the one carried over from the home deck by the persistent media layer, which
 * is why its video is still playing.
 *
 * Native touch scrolling plus scroll-snap is all a phone needs, so the
 * prototype's wheel mapping and pointer drag are gone.
 */
export default function CaseMobile({ project }: { project: Project }) {
  const { cp, stage } = useStage();
  const reduced = useReducedMotion() ?? false;
  const router = useRouter();
  const railRef = useRef<HTMLDivElement>(null);

  const shots = project.shots;
  const pitch = railPitch(stage);
  const pad = railPadding(stage);
  const s = stage.s;
  const w = CASE.mobile.w * s;
  const h = CASE.mobile.h * s;

  const onScroll = useCallback(() => {
    const el = railRef.current;
    if (!el || pitch === 0) return;
    cp.set(Math.max(0, el.scrollLeft / pitch));
  }, [cp, pitch]);

  const goHome = useCallback(() => {
    router.push("/");
  }, [router]);

  const titleTop = CASE.mobile.top * s + h + 30 * s;

  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden" }}>
      <Header variant="case" />

      <div
        ref={railRef}
        onScroll={onScroll}
        className="no-scrollbar"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: CASE.mobile.top * s,
          height: h + 40,
          display: "flex",
          alignItems: "flex-start",
          gap: CASE.mobile.gap * s,
          padding: `0 ${pad}px`,
          overflowX: "auto",
          overflowY: "hidden",
          scrollSnapType: "x mandatory",
          touchAction: "pan-x",
          zIndex: 52,
        }}
      >
        {/*
          Slot for the shared card. It reserves the space and carries the snap
          point; the media layer paints over it.
        */}
        <div
          aria-hidden
          style={{
            flex: "0 0 auto",
            width: w,
            height: h,
            scrollSnapAlign: "center",
          }}
        />

        {shots.map((shot, i) => (
          <RailCard
            key={shot.n}
            index={i + 1}
            width={w}
            height={h}
            radius={CASE.mobile.r * s}
            reduced={reduced}
          >
            <span
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 18,
                textAlign: "center",
                fontFamily: "var(--font-mono)",
                fontSize: 9.5,
                letterSpacing: "0.14em",
                color: "oklch(0.98 0 0 / 0.24)",
              }}
            >
              {shot.n}
            </span>
          </RailCard>
        ))}

        <RailCard
          index={shots.length + 1}
          width={w}
          height={h}
          radius={CASE.mobile.r * s}
          reduced={reduced}
          light
          onClick={goHome}
        >
          <span
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: "50%",
              transform: "translateY(-50%)",
              textAlign: "center",
              fontFamily: "var(--font-mono)",
              fontSize: 9.5,
              letterSpacing: "0.14em",
              color: "oklch(0.28 0.006 60 / 0.6)",
            }}
          >
            RETURN TO WORK
          </span>
        </RailCard>
      </div>

      {/*
        No progress indicator here: the peeking neighbours already carry
        position. Home keeps its ticks because the vertical deck genuinely
        hides what is behind it.
      */}
      <div
        style={{
          position: "absolute",
          left: 24,
          right: 24,
          top: titleTop,
          height: 50,
          zIndex: 56,
          textAlign: "center",
        }}
      >
        <RailTitle index={0} title={project.title} meta={project.year} />
        {shots.map((shot, i) => (
          <RailTitle
            key={shot.n}
            index={i + 1}
            title={shot.title}
            meta={shot.meta}
          />
        ))}
      </div>
    </div>
  );
}

function RailCard({
  index,
  width,
  height,
  radius,
  reduced,
  light,
  onClick,
  children,
}: {
  index: number;
  width: number;
  height: number;
  radius: number;
  reduced: boolean;
  light?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const { cp } = useStage();
  const near = useTransform(cp, (v) => Math.min(1, Math.abs(v - index)));
  const rotate = useTransform(cp, (v) => {
    if (reduced) return 0;
    const d = index - v;
    return (d > 0 ? 1 : -1) * Math.min(1, Math.abs(d));
  });
  const y = useTransform(near, (n) => (reduced ? 0 : n * 8));
  const scale = useTransform(near, (n) => (reduced ? 1 : 1 - n * 0.035));
  const opacity = useTransform(near, (n) => 1 - n * 0.24);

  const Tag = onClick ? motion.button : motion.div;

  return (
    <Tag
      onClick={onClick}
      style={{
        position: "relative",
        flex: "0 0 auto",
        width,
        height,
        border: 0,
        padding: 0,
        borderRadius: radius,
        overflow: "hidden",
        scrollSnapAlign: "center",
        background: light ? "var(--return-card)" : "var(--shot-empty)",
        boxShadow: light
          ? "inset 0 0 0 1px oklch(0.18 0.006 60 / 0.12)"
          : SHADOW.carousel,
        transformOrigin: "50% 50%",
        cursor: onClick ? "pointer" : "default",
        rotate,
        y,
        scale,
        opacity,
      }}
    >
      {children}
    </Tag>
  );
}

function RailTitle({
  index,
  title,
  meta,
}: {
  index: number;
  title: string;
  meta: string;
}) {
  const { cp } = useStage();
  const opacity = useTransform(cp, (v) =>
    clamp01(1 - Math.abs(v - index) * 2.4),
  );
  const x = useTransform(cp, (v) => (v - index) * 26);

  return (
    <motion.div
      style={{ position: "absolute", left: 0, right: 0, top: 0, opacity, x }}
    >
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 400,
          fontSize: 21,
          lineHeight: 1.14,
          letterSpacing: "-0.026em",
        }}
      >
        {title}
      </div>
      <div
        style={{
          paddingTop: 7,
          fontFamily: "var(--font-mono)",
          fontSize: 9,
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
