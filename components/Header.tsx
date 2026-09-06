"use client";

import Link from "next/link";
import { useStage } from "./media/stage";
import { CASE } from "@/lib/design";

const mono = {
  fontFamily: "var(--font-mono)",
  fontWeight: 500,
  letterSpacing: "0.06em",
  textTransform: "uppercase" as const,
};

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

  if (variant === "case") {
    return (
      <header
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          zIndex: 70,
          display: "flex",
          alignItems: "baseline",
          gap: 22 * ts,
          padding: pad,
          fontFamily: "var(--font-mono)",
          fontWeight: 400,
          fontSize: 10 * ts,
          letterSpacing: "0.1em",
        }}
      >
        <Link href="/" style={{ opacity: 0.5 }}>
          ← WORK
        </Link>
        {kicker ? <span style={{ opacity: 0.3 }}>{kicker}</span> : null}
      </header>
    );
  }

  return (
    <header
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 0,
        zIndex: 70,
        display: "flex",
        justifyContent: mobile ? "flex-end" : "space-between",
        alignItems: "baseline",
        padding: pad,
      }}
    >
      {/* The name is deliberately absent on mobile. */}
      {!mobile ? (
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 600,
            fontSize: 15 * ts,
            lineHeight: 1,
            letterSpacing: "-0.01em",
          }}
        >
          Remington McElhaney
        </div>
      ) : null}
      <nav
        style={{
          ...mono,
          display: "flex",
          gap: (mobile ? 16 : 26) * ts,
          fontSize: (mobile ? 10 : 12) * ts,
          lineHeight: 1,
        }}
      >
        <span>Work</span>
        <span style={{ opacity: 0.42 }}>About</span>
      </nav>
    </header>
  );
}
