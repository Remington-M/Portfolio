"use client";

import { HOUSE_CSS } from "@/lib/design";
import { projects } from "@/lib/projects";
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
  const ts = useStage().stage.ts;
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
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 400,
                  fontSize: (on ? 28 : 20) * ts,
                  lineHeight: 1.1,
                  letterSpacing: on ? "-0.032em" : "-0.024em",
                  opacity: on ? 1 : 0.36,
                  transition: `font-size .45s ${HOUSE_CSS}, opacity .35s ease, letter-spacing .45s ease`,
                }}
              >
                {project.title}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontWeight: 400,
                  fontSize: 9.5 * ts,
                  lineHeight: 1,
                  fontVariantNumeric: "tabular-nums",
                  letterSpacing: "0.09em",
                  opacity: on ? 0.5 : 0.2,
                  transition: "opacity .35s ease",
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
