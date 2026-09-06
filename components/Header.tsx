"use client";

import Link from "next/link";
import { useStage } from "./media/stage";
import { CASE, TYPE, type as typeStyle } from "@/lib/design";

export default function Header({
  variant,
  kicker,
}: {
  variant: "home" | "case";
  kicker?: string;
}) {
  const { mobile, stage } = useStage();
  const ts = stage.ts;
  // The header rides the top edge of the scaled stage, not the raw viewport,
  // so its margin stays in proportion once the scale clamps on a tall display.
  // The case header shares the intro screen's left rail — it is the top line
  // of that type column, not a separate thing pinned to the corner. Its inset
  // is a horizontal measurement and takes the horizontal scale.
  const sideX = (variant === "case" ? CASE.intro.rail : 64) * stage.sx;
  const pad = mobile
    ? `${stage.top + 22 * stage.s}px ${24 * stage.sx}px`
    : `${stage.top + 28 * stage.s}px ${sideX}px`;

  /**
   * One header, both pages.
   *
   * The two used to be separate layouts with separate type: the case variant
   * ran mono 10px/400 at half opacity, the home variant mono 12px/500 with a
   * 15px 600 name beside it. Same bar, same job, three sizes and two weights
   * between them. They share a frame now, and the only difference is what
   * sits on the left — the name, or the way back.
   */
  const frame: React.CSSProperties = {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    zIndex: 70,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 22 * ts,
    padding: pad,
  };

  if (variant === "case") {
    return (
      <header style={frame}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 22 * ts }}>
          {/* U+2190, then an ordinary space — not a glyph with padding. */}
          <Link href="/" style={{ ...typeStyle(TYPE.label, ts), color: "var(--ink-3)" }}>
            ← WORK
          </Link>
          {kicker ? (
            <span style={{ ...typeStyle(TYPE.label, ts), color: "var(--ink-3)" }}>
              {kicker}
            </span>
          ) : null}
        </div>
      </header>
    );
  }

  /*
    No name in the corner.

    It was the left half of this bar on desktop and absent on mobile, which
    already said it was not carrying much — the page is one person's work and
    says so in the first line of the hero. What is left is the nav, so the bar
    ends at the right rather than spanning.
  */
  return (
    <header style={{ ...frame, justifyContent: "flex-end" }}>
      <nav
        style={{
          ...typeStyle(TYPE.label, ts),
          display: "flex",
          gap: (mobile ? 16 : 26) * ts,
        }}
      >
        <span style={{ color: "var(--ink)" }}>Work</span>
        <span style={{ color: "var(--ink-3)" }}>About</span>
      </nav>
    </header>
  );
}
