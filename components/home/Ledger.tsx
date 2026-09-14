"use client";

import { motion, useReducedMotion } from "motion/react";
import { HOUSE_CSS, LEDGER_IN, TYPE, type as typeStyle } from "@/lib/design";
import { projects } from "@/lib/projects";
import { useStage } from "@/components/media/stage";
import { heroSpring } from "@/lib/heroTuning";

/**
 * Desktop ledger. The cards carry no titles — this names the project.
 *
 * Rows scroll the deck rather than navigating, which is the designed behaviour.
 * Real links to every project live in the hidden nav on the home page, so
 * crawlers and screen readers still reach them directly.
 */
export default function Ledger({
  front,
  onJump,
  arrived = true,
  entrance = "rise",
}: {
  front: number;
  onJump: (index: number) => void;
  /** Whether the deck has arrived: the rows rise into place when it has,
   *  each a beat after the one above, and drop back when it has not. */
  arrived?: boolean;
  /** "rise" on the way down from the hero; "fade" coming back from a
   *  project, where the deck is already in place and the rows just appear. */
  entrance?: "rise" | "fade";
}) {
  const ts = useStage().stage.ts;
  const reduced = useReducedMotion() ?? false;
  return (
    <ol
      style={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        width: 460 * ts,
      }}
    >
      {projects.map((project, i) => {
        const on = i === front;
        return (
          <motion.li
            key={project.slug}
            initial={entrance === "fade" && !reduced ? { opacity: 0, y: 0 } : false}
            animate={entrance === "fade" ? { opacity: 1, y: 0 } : {
              y: arrived || reduced ? 0 : LEDGER_IN.rise * ts,
              opacity: arrived || reduced ? 1 : 0,
            }}
            transition={entrance === "fade" ? { opacity: { duration: LEDGER_IN.returnFade / 1000, ease: "linear" } } : {
              y: {
                ...heroSpring(LEDGER_IN.stiffness, LEDGER_IN.ratio, LEDGER_IN.mass),
                delay: arrived ? LEDGER_IN.delay + i * LEDGER_IN.stagger : 0,
              },
              opacity: {
                duration: LEDGER_IN.fade,
                ease: "linear",
                delay: arrived ? LEDGER_IN.delay + i * LEDGER_IN.stagger : 0,
              },
            }}
          >
            <button
              type="button"
              onClick={() => onJump(i)}
              aria-current={on ? "true" : undefined}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 24 * ts,
                alignItems: "center",
                width: "100%",
                padding: `${12 * ts}px 0`,
                border: 0,
                background: "none",
                color: "inherit",
                textAlign: "left",
                cursor: "pointer",
                font: "inherit",
              }}
            >
              <span
                style={{
                  /**
                   * Two roles, not one role at two opacities. Title L and
                   * Title S differ in size and tracking; the difference
                   * between active and resting is now carried by ink rather
                   * than by making the resting rows transparent.
                   */
                  ...typeStyle(on ? TYPE.titleL : TYPE.titleS, ts),
                  color: on ? "var(--ink)" : "var(--ink-3)",
                  transition: `font-size .45s ${HOUSE_CSS}, color .35s ease, letter-spacing .45s ease`,
                }}
              >
                {project.title}
              </span>
              <span
                style={{
                  ...typeStyle(TYPE.numeral, ts),
                  color: on ? "var(--ink-2)" : "var(--ink-4)",
                  transition: "color .35s ease",
                }}
              >
                {project.year}
              </span>
            </button>
          </motion.li>
        );
      })}
    </ol>
  );
}
