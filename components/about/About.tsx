"use client";

import { motion, useReducedMotion } from "motion/react";
import Header from "@/components/Header";
import { useStage } from "@/components/media/stage";
import { TYPE, type as typeStyle } from "@/lib/design";
import { about } from "@/lib/about";
import Polaroid from "./Polaroid";

/**
 * The About page.
 *
 * The case page's anatomy with the sides swapped: the print sits on the
 * left rail where a case study's viewer would be, and the type column is
 * set off to its right. No headline — the first sentence, a step up from
 * the body, does that job. The page scrolls inside its own container,
 * since the document itself never does on this site.
 */

/** Authored against the 1440 stage, like everything else. */
const LAYOUT = {
  /** The left margin, shared with the header. */
  rail: 64,
  /** The print's box: from the rail, this wide, the print set in from its left. */
  printBox: 600,
  printInset: 40,
  printWidth: 440,
  /** The type column. */
  colLeft: 800,
  colWidth: 460,
  lean: -2,
} as const;

export default function About() {
  const { stage, mobile } = useStage();
  const reduced = useReducedMotion() ?? false;
  const ts = stage.ts;
  const sx = stage.sx;

  // The print is sized from the stage, like the cards: from the authored
  // width on desktop, clamped so it never outgrows the height; from the
  // viewport on mobile.
  const printW = mobile
    ? Math.min(stage.w * 0.66, 300)
    : Math.round(Math.min(LAYOUT.printWidth * sx, stage.h * 0.52));

  const rise = (i: number) =>
    reduced
      ? {}
      : {
          initial: { opacity: 0, y: 12 },
          animate: { opacity: 1, y: 0 },
          transition: {
            delay: 0.45 + i * 0.08,
            duration: 0.7,
            ease: [0.22, 1, 0.36, 1] as const,
          },
        };

  const column = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 24 * ts,
        width: mobile ? "100%" : LAYOUT.colWidth * sx,
      }}
    >
      <motion.div {...rise(0)} style={{ ...typeStyle(TYPE.label, ts), color: "var(--ink-3)" }}>
        ABOUT
      </motion.div>
      <motion.p
        {...rise(1)}
        style={{
          ...typeStyle(TYPE.aboutLead, ts),
          margin: 0,
          color: "var(--ink)",
          textWrap: "pretty",
        }}
      >
        {about.lead}
      </motion.p>
      {about.body.map((para, i) => (
        <motion.p
          key={i}
          {...rise(2 + i)}
          style={{
            ...typeStyle(TYPE.bodyS, ts),
            margin: 0,
            color: "var(--ink-2)",
            textWrap: "pretty",
          }}
        >
          {para}
        </motion.p>
      ))}
      <motion.div
        {...rise(2 + about.body.length)}
        style={{ height: 1, marginTop: 8 * ts, background: "var(--rule)" }}
      />
      <motion.dl
        {...rise(3 + about.body.length)}
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: `${18 * ts}px ${32 * ts}px`,
          margin: 0,
          padding: 0,
          ...typeStyle(TYPE.value, ts),
          color: "var(--ink-2)",
        }}
      >
        <div style={{ flex: "0 0 auto" }}>
          <dt style={{ ...typeStyle(TYPE.label, ts), color: "var(--ink-3)" }}>BASED</dt>
          <dd style={{ margin: 0 }}>{about.based}</dd>
        </div>
        {about.contact.map((c) => (
          <div key={c.label} style={{ flex: "0 0 auto" }}>
            <dt style={{ ...typeStyle(TYPE.label, ts), color: "var(--ink-3)" }}>
              {c.label.toUpperCase()}
            </dt>
            <dd style={{ margin: 0 }}>
              <a href={c.href}>{c.value}</a>
            </dd>
          </div>
        ))}
      </motion.dl>
    </div>
  );

  const print = (
    <Polaroid
      src={about.photo}
      alt={about.alt}
      back={about.back}
      width={printW}
      lean={LAYOUT.lean}
    />
  );

  if (mobile) {
    return (
      <main
        className="no-scrollbar"
        style={{
          position: "fixed",
          inset: 0,
          overflowY: "auto",
          // Same as the home page: no rubber-band dragging the header.
          overscrollBehaviorY: "none",
          overflowX: "hidden",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <Header variant="about" />
        <div
          style={{
            position: "relative",
            width: stage.w,
            minHeight: "100%",
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
            gap: 56 * ts,
            padding: `${stage.top + 96 * stage.s}px ${24 * sx}px ${64 * stage.s}px`,
          }}
        >
          <div style={{ display: "flex", justifyContent: "center" }}>{print}</div>
          {column}
        </div>
      </main>
    );
  }

  const rail = LAYOUT.rail * sx;
  return (
    <main
      className="no-scrollbar"
      style={{
        position: "fixed",
        inset: 0,
        overflowY: "auto",
        overscrollBehaviorY: "none",
        overflowX: "hidden",
      }}
    >
      <Header variant="about" />
      <div
        style={{
          position: "relative",
          width: stage.w,
          height: "100%",
          minHeight: 560 * stage.s,
          margin: "0 auto",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: rail,
            top: 0,
            bottom: 0,
            width: LAYOUT.printBox * sx,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",
            paddingLeft: LAYOUT.printInset * sx,
          }}
        >
          {print}
        </div>
        <div
          style={{
            position: "absolute",
            left: LAYOUT.colLeft * sx,
            top: 0,
            bottom: 0,
            display: "flex",
            alignItems: "center",
          }}
        >
          {column}
        </div>
      </div>
    </main>
  );
}
