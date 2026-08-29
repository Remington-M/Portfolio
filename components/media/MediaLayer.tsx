"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { SHADOW, SPRING, DECK } from "@/lib/design";
import {
  caseFrame,
  deckCard,
  frameHasBar,
  railCard,
  type Geo,
} from "@/lib/geometry";
import { spring, snapSpring, stepSpring, type Spring } from "@/lib/spring";

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
  const { p, pi, cp, selected, mode, stage, transitionKey } = useStage();
  const reduced = useReducedMotion() ?? false;

  const springs = useRef(projects.map(makeSprings));
  const values = useRef(projects.map(makeValues));
  const primed = useRef(false);
  const settling = useRef(false);

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

  useAnimationFrame((_, deltaMs) => {
    if (stage.w === 0 || stage.h === 0) return;
    const dt = Math.min(deltaMs, 64) / 1000;
    const pv = p.get();
    const pig = pi.get();
    const cpv = cp.get();
    const sel = selected.get();
    const n = projects.length;

    let moving = false;

    for (let i = 0; i < n; i++) {
      const s = springs.current[i];
      const v = values.current[i];

      const deck = deckCard(i, n, pv, pig, stage, reduced);
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
      } else {
        target = deck;
      }

      // Scrubbing must be exact, so the springs only run while a route change
      // is settling. Once at rest we snap, and scroll drives the cards directly.
      const useSpring = settling.current && !reduced;
      const config = i === sel ? SPRING.handoff : SPRING.drop;

      for (const field of FIELDS) {
        const to = target[field];
        if (useSpring) {
          stepSpring(s[field], to, dt, config);
          if (s[field].value !== to || s[field].velocity !== 0) moving = true;
        } else {
          snapSpring(s[field], to);
        }
        v[field].set(s[field].value);
      }
      v.z.set(target.z);
    }

    if (!primed.current) {
      // First painted frame: land on the targets rather than flying in from
      // zero, so a deep link or a refresh shows the design at rest.
      for (let i = 0; i < n; i++) {
        const s = springs.current[i];
        for (const field of FIELDS) s[field].velocity = 0;
      }
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
          poster={project.poster}
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
            <source src={project.srcWebm} type="video/webm" />
          ) : null}
          {project.src ? <source src={project.src} type="video/mp4" /> : null}
        </video>
      ) : project.poster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={project.poster}
          alt=""
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
