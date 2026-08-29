"use client";

import Link from "next/link";
import { useStage } from "./media/stage";

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
  const { mobile } = useStage();
  const pad = mobile ? "22px 24px" : "28px 64px";

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
          gap: 22,
          padding: pad,
          fontFamily: "var(--font-mono)",
          fontWeight: 400,
          fontSize: 10,
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
            fontSize: 15,
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
          gap: mobile ? 16 : 26,
          fontSize: mobile ? 10 : 12,
          lineHeight: 1,
        }}
      >
        <span>Work</span>
        <span style={{ opacity: 0.42 }}>About</span>
      </nav>
    </header>
  );
}
