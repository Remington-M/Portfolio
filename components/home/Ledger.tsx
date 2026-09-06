"use client";

import { HOUSE_CSS, TYPE, type as typeStyle } from "@/lib/design";
import { projects, titleLines } from "@/lib/projects";
import { useStage } from "@/components/media/stage";

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
}: {
  front: number;
  onJump: (index: number) => void;
}) {
  const { stage, registerTitleAnchor, titleFlying } = useStage();
  const ts = stage.ts;
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
          <li key={project.slug}>
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
                /**
                 * The active row is the shared title's home on this page: it
                 * registers itself so the layer knows where to fly from, and
                 * steps aside while the flight is on so there is exactly one
                 * copy of the words on screen.
                 *
                 * Only the active row carries a ref at all. Giving every row
                 * one that registered `null` when inactive meant the five
                 * rows that are not the front card took turns erasing the
                 * registration the front one had just made, and which won came
                 * down to their order in the list.
                 */
                ref={
                  on ? (el) => registerTitleAnchor("ledger", el) : undefined
                }
                style={{
                  /**
                   * Two roles, not one role at two opacities. Title L and
                   * Title S differ in size and tracking; the difference
                   * between active and resting is now carried by ink rather
                   * than by making the resting rows transparent.
                   */
                  ...typeStyle(on ? TYPE.titleL : TYPE.titleS, ts),
                  color: on ? "var(--ink)" : "var(--ink-3)",
                  visibility: on && titleFlying ? "hidden" : "visible",
                  transition: `font-size .45s ${HOUSE_CSS}, color .35s ease, letter-spacing .45s ease`,
                }}
              >
                {titleLines(project).map((line, k) => (
                  <span key={k} style={{ display: "block" }}>
                    {line}
                  </span>
                ))}
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
          </li>
        );
      })}
    </ol>
  );
}
