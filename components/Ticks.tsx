"use client";

import { motion } from "motion/react";
import { SPRING } from "@/lib/design";

/**
 * The tick row: active tick wide, immediate neighbours faint, the rest fainter.
 * Used for deck position on mobile home and shot position on project pages.
 *
 * The width is a spring rather than a CSS transition, and not for the sake of
 * it: the row marks the same moment the viewer does, and the viewer ends its
 * move by running slightly past and settling. A tick that eases to a stop next
 * to that reads as a separate widget keeping score. Sharing the character —
 * `SPRING.tick` carries the carry's damping ratio — makes the two one event.
 */
export default function Ticks({
  count,
  active,
  onJump,
  labels,
}: {
  count: number;
  active: number;
  onJump: (index: number) => void;
  labels: (index: number) => string;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: 7,
      }}
    >
      {Array.from({ length: count }, (_, i) => {
        const d = Math.abs(i - active);
        return (
          <motion.button
            key={i}
            type="button"
            onClick={() => onJump(i)}
            aria-label={labels(i)}
            aria-current={d === 0 ? "true" : undefined}
            initial={false}
            animate={{ width: d === 0 ? 26 : 10 }}
            transition={SPRING.tick}
            style={{
              height: 20,
              display: "flex",
              alignItems: "center",
              padding: 0,
              border: 0,
              background: "none",
              color: "inherit",
              cursor: "pointer",
            }}
          >
            <span
              style={{
                width: "100%",
                height: 1,
                background: "currentColor",
                opacity: d === 0 ? 0.72 : d === 1 ? 0.26 : 0.13,
                /**
                 * Still a tween. Opacity has nowhere to overshoot to — past 1
                 * it simply clips — so a spring would spend its character on
                 * something invisible. Shortened to keep pace with the width.
                 */
                transition: "opacity .26s ease",
              }}
            />
          </motion.button>
        );
      })}
    </div>
  );
}
