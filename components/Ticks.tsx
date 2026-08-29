"use client";

import { HOUSE_CSS } from "@/lib/design";

/**
 * The tick row: active tick wide, immediate neighbours faint, the rest fainter.
 * Used for deck position on mobile home and shot position on project pages.
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
          <button
            key={i}
            type="button"
            onClick={() => onJump(i)}
            aria-label={labels(i)}
            aria-current={d === 0 ? "true" : undefined}
            style={{
              width: d === 0 ? 26 : 10,
              height: 20,
              display: "flex",
              alignItems: "center",
              padding: 0,
              border: 0,
              background: "none",
              color: "inherit",
              cursor: "pointer",
              transition: `width .45s ${HOUSE_CSS}`,
            }}
          >
            <span
              style={{
                width: "100%",
                height: 1,
                background: "currentColor",
                opacity: d === 0 ? 0.72 : d === 1 ? 0.26 : 0.13,
                transition: "opacity .35s ease",
              }}
            />
          </button>
        );
      })}
    </div>
  );
}
