"use client";

import { motion, useReducedMotion } from "motion/react";
import Header from "@/components/Header";
import { useStage } from "@/components/media/stage";
import { TYPE, type as typeStyle } from "@/lib/design";
import { about } from "@/lib/about";
import Polaroid from "./Polaroid";
import PolaroidTunePanel from "./PolaroidTunePanel";
import ClaudeMark from "./ClaudeMark";

/**
 * The About page.
 *
 * The case page's anatomy with the sides swapped: the print sits on the
 * left rail where a case study's viewer would be, and the type column is
 * set off to its right. No headline — the first sentence, a step up from
 * the body, does that job. The page scrolls inside its own container,
 * since the document itself never does on this site.
 */

/**
 * Authored against the 1440 stage, like everything else.
 *
 * The rails are the home page's: the print's left edge sits on the 64px
 * rail the nav keeps, and the type column's right edge on the same rail at
 * the other side. The page used to keep the print 104 in and the column 180
 * from the right, which read as tighter than the pages either side of it.
 */
const LAYOUT = {
  /** The margin, shared with the header. */
  rail: 64,
  /** The print, its left edge on the rail. */
  printWidth: 440,
  /** The type column, its right edge on the right rail. Wide enough to
   *  come across toward the print rather than sit as a strip at the edge. */
  colWidth: 600,
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

  /**
   * The column fades in as one block, no rise and no stagger: the print's
   * arrival is the motion on this page, and type stepping in beside it
   * was a second thing to watch.
   */
  const fade = reduced
    ? {}
    : {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        transition: { delay: 0.35, duration: 0.5, ease: "linear" as const },
      };

  const column = (
    <motion.div
      {...fade}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 24 * ts,
        width: mobile ? "100%" : LAYOUT.colWidth * sx,
      }}
    >
      <div style={{ ...typeStyle(TYPE.label, ts), color: "var(--ink-3)" }}>
        ABOUT
      </div>
      {/*
        The mark signs the copy off in line with its last word, the way a
        name follows a sentence — so the paragraph it belongs to loses its
        final period, and the mark stands where the period was. Empty
        paragraphs are skipped rather than rendered as a blank line.
      */}
      {(() => {
        const paras = [about.lead, ...about.body.filter((t) => t.trim())];
        const last = paras.length - 1;
        return paras.map((text, i) => {
          const lead = i === 0;
          const signed = i === last;
          const shown = signed ? text.replace(/[\s.]+$/, "") : text;
          const size = (lead ? TYPE.aboutLead.size : TYPE.bodyS.size) * ts;
          return (
            <p
              key={i}
              style={{
                ...typeStyle(lead ? TYPE.aboutLead : TYPE.bodyS, ts),
                margin: 0,
                color: lead ? "var(--ink)" : "var(--ink-2)",
                textWrap: "pretty",
              }}
            >
              {shown}
              {signed ? (
                <span
                  style={{
                    display: "inline-block",
                    verticalAlign: "-0.14em",
                    marginLeft: "0.3em",
                    // Kept with the last word: the mark never starts a line.
                    whiteSpace: "nowrap",
                  }}
                >
                  <ClaudeMark size={size * 0.95} />
                </span>
              ) : null}
            </p>
          );
        });
      })()}
      <div style={{ height: 1, marginTop: 8 * ts, background: "var(--rule)" }} />
      <dl
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
      </dl>
    </motion.div>
  );

  const print = (
    <Polaroid
      src={about.photo}
      alt={about.alt}
      back={about.back}
      writing={about.writing}
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
          <Header variant="about" />
          <div style={{ display: "flex", justifyContent: "center" }}>{print}</div>
          {column}
        </div>
        <PolaroidTunePanel />
      </main>
    );
  }

  const rail = LAYOUT.rail * sx;
  return (
    <main
      style={{
        position: "fixed",
        inset: 0,
        // Nothing to scroll to on desktop: the page is one screen, and the
        // print's canvas, which is much larger than the print for the swing
        // and the shadow, must not be what makes it scroll.
        overflow: "hidden",
        overscrollBehaviorY: "none",
      }}
    >
      {/*
        The header lives inside the stage box, as it does on the home page,
        so the nav sits in the same place on both. Mounted on the scroller
        itself it took its margin from the window instead of the stage.
      */}
      <div
        style={{
          position: "relative",
          width: stage.w,
          height: "100%",
          minHeight: 560 * stage.s,
          margin: "0 auto",
        }}
      >
        <Header variant="about" />
        <div
          style={{
            position: "absolute",
            left: rail,
            top: 0,
            bottom: 0,
            // Exactly the print's width: the print centres itself in
            // whatever box it is given, and a wider one moved it off the rail.
            width: printW,
            display: "flex",
            alignItems: "center",
          }}
        >
          {print}
        </div>
        <div
          style={{
            position: "absolute",
            right: rail,
            top: 0,
            bottom: 0,
            display: "flex",
            alignItems: "center",
          }}
        >
          {column}
        </div>
      </div>
      <PolaroidTunePanel />
    </main>
  );
}
