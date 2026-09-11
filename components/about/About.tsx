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
 * A print on a table and a column of type beside it. The page scrolls
 * inside its own container, since the document itself never does on this
 * site — the stage owns scrolling everywhere else, and this keeps the same
 * rule rather than making an exception for one route.
 */
export default function About() {
  const { stage, mobile } = useStage();
  const reduced = useReducedMotion() ?? false;
  const ts = stage.ts;
  const sx = stage.sx;

  // The print is sized from the stage, like the cards: from height on
  // desktop so it sits inside the fold, from width on mobile.
  const printW = mobile
    ? Math.min(stage.w * 0.7, 300)
    : Math.round(Math.min(292 * stage.s, stage.w * 0.28));

  const rise = (i: number) =>
    reduced
      ? {}
      : {
          initial: { opacity: 0, y: 14 },
          animate: { opacity: 1, y: 0 },
          transition: {
            delay: 0.35 + i * 0.09,
            duration: 0.7,
            ease: [0.22, 1, 0.36, 1] as const,
          },
        };

  return (
    <main
      className="no-scrollbar"
      style={{
        position: "fixed",
        inset: 0,
        overflowY: "auto",
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
          flexDirection: mobile ? "column" : "row",
          alignItems: mobile ? "stretch" : "center",
          justifyContent: mobile ? "flex-start" : "space-between",
          gap: mobile ? 60 * ts : 64 * sx,
          padding: mobile
            ? `${stage.top + 96 * stage.s}px ${24 * sx}px ${64 * stage.s}px`
            : `${stage.top + 120 * stage.s}px ${64 * sx}px ${96 * stage.s}px`,
        }}
      >
        <div
          style={{
            flex: mobile ? "0 0 auto" : `0 0 ${Math.round(printW * 1.25)}px`,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <Polaroid
            src={about.photo}
            alt={about.alt}
            back={about.back}
            width={printW}
          />
        </div>

        <div
          style={{
            flex: "1 1 auto",
            minWidth: 0,
            maxWidth: mobile ? "none" : 560 * sx,
          }}
        >
          <motion.h1
            {...rise(0)}
            style={{
              ...typeStyle(mobile ? TYPE.heroMobile : TYPE.hero, ts),
              margin: 0,
              color: "var(--ink)",
              textWrap: "pretty",
            }}
          >
            {about.lead}
          </motion.h1>
          {about.body.map((para, i) => (
            <motion.p
              key={i}
              {...rise(1 + i)}
              style={{
                ...typeStyle(TYPE.body, ts),
                margin: `${(i === 0 ? 28 : 18) * ts}px 0 0`,
                color: "var(--ink-2)",
                textWrap: "pretty",
              }}
            >
              {para}
            </motion.p>
          ))}
          <motion.div
            {...rise(1 + about.body.length)}
            style={{ height: 1, marginTop: 34 * ts, background: "var(--rule)" }}
          />
          <motion.dl
            {...rise(2 + about.body.length)}
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: `${18 * ts}px ${32 * ts}px`,
              margin: 0,
              padding: `${26 * ts}px 0 0`,
              ...typeStyle(TYPE.value, ts),
              color: "var(--ink-2)",
            }}
          >
            <div style={{ flex: "0 0 auto" }}>
              <dt style={{ ...typeStyle(TYPE.label, ts), color: "var(--ink-3)" }}>
                ROLE
              </dt>
              <dd style={{ margin: 0 }}>{about.role}</dd>
            </div>
            <div style={{ flex: "0 0 auto" }}>
              <dt style={{ ...typeStyle(TYPE.label, ts), color: "var(--ink-3)" }}>
                BASED
              </dt>
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
      </div>
    </main>
  );
}
