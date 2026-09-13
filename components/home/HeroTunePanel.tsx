"use client";

import { useEffect, useState } from "react";
import {
  heroTune,
  heroTuneSource,
  replayHero,
  resetHeroTune,
  setHeroTune,
  subscribeHeroTune,
  type HeroTune,
} from "@/lib/heroTuning";

/**
 * Live controls for the typed landing sequence.
 *
 * Off unless asked for: `?tune` on the home URL, or press `H`. Every number
 * in HERO_TYPE is a slider; Replay runs the sequence again with the current
 * values; Copy prints them shaped for `design.ts`.
 */
export default function HeroTunePanel() {
  const [open, setOpen] = useState(false);
  const [, bump] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => subscribeHeroTune(() => bump((n) => n + 1)), []);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("tune")) setOpen(true);
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)))
        return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "h" || e.key === "H") setOpen((v) => !v);
      if ((e.key === "r" || e.key === "R") && open) replayHero();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  type NumKey = { [K in keyof HeroTune]: HeroTune[K] extends number ? K : never }[keyof HeroTune];
  const S = (name: string, key: NumKey, min: number, max: number, step: number, unit?: string) => (
    <Slider
      key={key}
      name={name}
      unit={unit}
      min={min}
      max={max}
      step={step}
      value={heroTune[key]}
      onChange={(v) => setHeroTune({ [key]: v })}
    />
  );

  return (
    <div style={panel}>
      <div style={head}>
        <span>LANDING · TYPED</span>
        <button style={ghost} onClick={() => setOpen(false)}>hide · H</button>
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
        <button style={{ ...ghost, flex: 1, background: "rgba(160,220,150,.18)" }} onClick={replayHero}>
          replay · R
        </button>
        <button
          style={{ ...ghost, flex: 1 }}
          onClick={async () => {
            await navigator.clipboard.writeText(heroTuneSource());
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
        >
          {copied ? "copied" : "copy design.ts"}
        </button>
        <button style={ghost} onClick={resetHeroTune}>reset</button>
      </div>

      <Group label="BEATS">
        {S("lead", "lead", 0, 2, 0.05, "s")}
        {S("blink in", "blinkIn", 0, 3, 0.05, "s")}
        {S("per char", "perChar", 0.02, 0.6, 0.01, "s")}
        {S("hold", "hold", 0, 4, 0.05, "s")}
      </Group>
      <Group label="CURSOR">
        {S("blink cycle", "blink", 0.2, 2, 0.05, "s")}
        {S("width", "cursorWidth", 0.02, 0.6, 0.005, "em")}
        {S("offset along line", "cursorOffset", -0.3, 0.5, 0.005, "em")}
        {S("above baseline", "cursorAbove", 0.3, 1.2, 0.01, "em")}
        {S("below baseline", "cursorBelow", 0, 0.6, 0.01, "em")}
      </Group>
      <Group label="SMEAR · FROM SPEED">
        {S("threshold speed", "smearThreshold", 0, 120, 1, "em/s")}
        {S("tail per em/s over", "smearGain", 0, 0.15, 0.001, "em")}
        {S("speed smoothing", "smearRise", 0, 0.3, 0.005, "s")}
        {S("tail relax", "smearRelax", 0, 0.5, 0.005, "s")}
      </Group>
      <Group label="SWEEP · CURSOR MOTION">
        {S("line gap", "lineGap", 0, 0.5, 0.01, "s")}
        <Toggle
          on={heroTune.sweepMode === "spring"}
          onClick={() => setHeroTune({ sweepMode: heroTune.sweepMode === "spring" ? "ease" : "spring" })}
          labelOn="spring — physics, ignores duration"
          labelOff="curve — duration and a bezier"
        />
        {heroTune.sweepMode === "spring" ? (
          <>
            {S("stiffness", "sweepStiffness", 10, 600, 1)}
            {S("damping ratio", "sweepRatio", 0.1, 2, 0.01)}
            {S("mass", "sweepMass", 0.2, 5, 0.05)}
          </>
        ) : (
          <>
            {S("per line", "sweep", 0.05, 1.5, 0.01, "s")}
            {(["x1", "y1", "x2", "y2"] as const).map((n, i) => (
              <Slider
                key={n}
                name={`ease ${n}`}
                min={i % 2 === 0 ? 0 : -0.5}
                max={i % 2 === 0 ? 1 : 1.5}
                step={0.01}
                value={heroTune.sweepEase[i]}
                onChange={(v) => {
                  const next = [...heroTune.sweepEase] as [number, number, number, number];
                  next[i] = v;
                  setHeroTune({ sweepEase: next });
                }}
              />
            ))}
          </>
        )}
      </Group>
      <Group label="WORDS">
        {S("travel — distance in", "wordTravel", 0, 3, 0.02, "em")}
        {S("delay after cursor", "wordDelay", 0, 0.6, 0.01, "s")}
        {S("stiffness", "wordStiffness", 10, 600, 1)}
        {S("damping ratio", "wordRatio", 0.1, 2, 0.01)}
        {S("mass", "wordMass", 0.2, 5, 0.05)}
        {S("fade", "wordFade", 0, 1, 0.02, "s")}
      </Group>
      <Group label="SLIDE · HEY GIVES UP THE CENTRE">
        {S("lead before sweep", "slideLead", 0, 0.6, 0.01, "s")}
        {S("stiffness", "slideStiffness", 10, 600, 1)}
        {S("damping ratio", "slideRatio", 0.1, 2, 0.01)}
        {S("mass", "slideMass", 0.2, 5, 0.05)}
      </Group>
      <Group label="ALL IN · THEN THE DEAL">
        {S("hold before deal", "holdIn", 0, 4, 0.05, "s")}
        {S("rise stiffness", "riseStiffness", 10, 400, 1)}
        {S("rise damping ratio", "riseRatio", 0.1, 2, 0.01)}
        {S("rise mass", "riseMass", 0.2, 5, 0.05)}
        {S("cursor blink out", "blinkOut", 0, 4, 0.05, "s")}
        {S("cursor fade out", "fadeOut", 0, 2, 0.05, "s")}
      </Group>
      <Group label="RIPPLE">
        {S("cell (device px)", "ripplePixel", 1, 6, 1)}
        {S("delay after deal", "rippleDelay", 0, 2, 0.05, "s")}
        {S("origin below box", "rippleOriginY", 1, 4, 0.05, "×h")}
        {S("speed", "rippleSpeed", 100, 3000, 10, "px/s")}
        {S("wavelength", "rippleWavelength", 20, 500, 5, "px")}
        {S("pulse width", "rippleWidth", 20, 800, 5, "px")}
        {S("amplitude", "rippleAmplitude", 0, 40, 0.5, "px")}
        {S("scatter", "rippleScatter", 0, 30, 0.5, "px")}
        {S("dim at crest", "rippleDim", 0, 1, 0.02)}
        {S("pulses", "ripplePulses", 1, 4, 1)}
        {S("pulse gap", "ripplePulseGap", 0.05, 1.5, 0.01, "s")}
        {S("pulse decay", "ripplePulseDecay", 0.2, 1, 0.02, "×")}
      </Group>
      <Group label="HOVER · PARTICLES">
        {S("radius", "hoverRadius", 10, 300, 1, "px")}
        {S("throw per px/s", "hoverForce", 0, 6, 0.05)}
        {S("outward vs along", "hoverOutward", 0, 1, 0.02)}
        {S("speed cap", "hoverMaxSpeed", 200, 6000, 50, "px/s")}
        {S("spring stiffness", "hoverStiffness", 5, 400, 1)}
        {S("spring damping ratio", "hoverRatio", 0.05, 2, 0.01)}
      </Group>
    </div>
  );
}

function Toggle({
  on, onClick, labelOn, labelOff,
}: {
  on: boolean; onClick: () => void; labelOn: string; labelOff: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        ...ghost,
        width: "100%",
        marginBottom: 7,
        textAlign: "left",
        background: on ? "rgba(160,220,150,.16)" : "rgba(255,255,255,.06)",
      }}
    >
      <span style={{ opacity: 0.5 }}>{on ? "◉" : "○"}</span> {on ? labelOn : labelOff}
    </button>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ opacity: 0.4, letterSpacing: ".12em", fontSize: 9, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

function Slider({
  name, unit, min, max, step, value, onChange,
}: {
  name: string; unit?: string; min: number; max: number; step: number;
  value: number; onChange: (v: number) => void;
}) {
  return (
    <label style={{ display: "block", marginBottom: 5 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
        <span style={{ opacity: 0.62 }}>{name}</span>
        <span>
          {value.toFixed(step < 0.01 ? 3 : 2)}
          {unit ? <span style={{ opacity: 0.4 }}> {unit}</span> : null}
        </span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", accentColor: "#e8e2d6", height: 14 }}
      />
    </label>
  );
}

const panel: React.CSSProperties = {
  position: "fixed",
  top: 14,
  right: 14,
  zIndex: 200,
  width: 252,
  maxHeight: "calc(100vh - 28px)",
  overflowY: "auto",
  padding: "10px 12px 12px",
  borderRadius: 10,
  background: "oklch(0.19 0.008 60 / 0.92)",
  backdropFilter: "blur(10px)",
  color: "#f2ede3",
  fontFamily: "var(--font-mono), ui-monospace, monospace",
  fontSize: 10,
  lineHeight: 1.3,
  boxShadow: "0 20px 50px -20px rgba(0,0,0,.55)",
};
const head: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  letterSpacing: ".12em", fontSize: 9, opacity: 0.85,
};
const ghost: React.CSSProperties = {
  background: "rgba(255,255,255,.09)", border: 0, color: "inherit", font: "inherit",
  padding: "4px 7px", borderRadius: 5, cursor: "pointer",
};
