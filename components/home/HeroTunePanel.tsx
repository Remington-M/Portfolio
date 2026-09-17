"use client";

import { useEffect, useState } from "react";
import {
  heroRead,
  heroTune,
  heroTuneChanges,
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
  const [copied, setCopied] = useState<string | null>(null);
  /** Shown when the clipboard is refused, so the text can still be taken. */
  const [fallback, setFallback] = useState<string | null>(null);

  const copy = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 1200);
    } catch {
      setFallback(text);
    }
  };

  useEffect(() => subscribeHeroTune(() => bump((n) => n + 1)), []);
  /* The readouts change every frame while the sequence runs; poll them. */
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => bump((n) => n + 1), 80);
    return () => clearInterval(id);
  }, [open]);
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
        <button style={ghost} onClick={resetHeroTune}>reset</button>
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
        <button
          style={{ ...ghost, flex: 1 }}
          onClick={() => copy("changes", heroTuneChanges() || "(nothing changed)")}
        >
          {copied === "changes" ? "copied" : "copy changes"}
        </button>
        <button
          style={{ ...ghost, flex: 1 }}
          onClick={() => copy("source", heroTuneSource())}
        >
          {copied === "source" ? "copied" : "copy design.ts"}
        </button>
      </div>
      {fallback !== null ? (
        <div style={{ marginTop: 6 }}>
          <div style={{ opacity: 0.5, marginBottom: 3 }}>clipboard refused — select and copy:</div>
          <textarea
            readOnly
            value={fallback}
            onFocus={(e) => e.currentTarget.select()}
            style={{ width: "100%", height: 90, font: "inherit", fontSize: 9, background: "rgba(255,255,255,.06)", color: "inherit", border: 0, borderRadius: 5, padding: 6 }}
          />
          <button style={{ ...ghost, marginTop: 3 }} onClick={() => setFallback(null)}>close</button>
        </div>
      ) : null}

      <Group label="SCROLL · AS THE DECK READS IT">
        <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,.12)", marginBottom: 5, position: "relative" }}>
          <div
            style={{
              position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 3,
              width: `${Math.min(100, (100 * heroRead.scrollTop) / Math.max(1, heroRead.scrollMax))}%`,
              background: heroRead.pinned ? "rgba(240,160,120,.9)" : "rgba(160,220,150,.9)",
            }}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, opacity: 0.75 }}>
          <span>top {heroRead.scrollTop.toFixed(0)}</span>
          <span>raw {heroRead.raw.toFixed(2)}</span>
          <span>card {heroRead.committed}</span>
          <span>deck {heroRead.deck.toFixed(2)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, opacity: 0.75 }}>
          <span>events {heroRead.events}</span>
          <span>turned {heroRead.turned}</span>
          <span style={{ color: heroRead.pinned ? "rgb(240,160,120)" : undefined }}>{heroRead.pinned ? "pinned" : "free"}</span>
        </div>
      </Group>
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
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 5, opacity: 0.7 }}>
          <span>last run · peak speed {heroRead.peakSpeed.toFixed(0)} em/s</span>
          <span>peak tail {heroRead.peakTail.toFixed(2)} em</span>
        </div>
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
        {S("text rise delay — after cards", "riseDelay", 0, 2, 0.02, "s")}
        {S("rise stiffness", "riseStiffness", 10, 400, 1)}
        {S("rise damping ratio", "riseRatio", 0.1, 2, 0.01)}
        {S("rise mass", "riseMass", 0.2, 5, 0.05)}
        {S("cursor blink out", "blinkOut", 0, 4, 0.05, "s")}
        {S("cursor fade out", "fadeOut", 0, 2, 0.05, "s")}
      </Group>
      <Group label="DEAL · THE STACK">
        {S("stiffness", "dealStiffness", 10, 400, 1)}
        {S("damping ratio", "dealRatio", 0.1, 2, 0.01)}
        {S("mass", "dealMass", 0.2, 5, 0.05)}
        {S("stiffness falloff per card back", "dealFalloff", 0, 0.5, 0.01)}
        {S("start below seat", "dealRiseHeights", 0, 2, 0.01, "cards")}
      </Group>
      <Group label="DEAL · THE FAN">
        {S("starts after rise", "fanDelay", 0, 2, 0.02, "s")}
        {S("stiffness", "fanStiffness", 10, 400, 1)}
        {S("damping ratio", "fanRatio", 0.1, 2, 0.01)}
        {S("mass", "fanMass", 0.2, 5, 0.05)}
        {S("stiffness falloff per card back", "fanFalloff", 0, 0.5, 0.01)}
        {S("ratio drop per card back", "fanRatioFalloff", 0, 0.3, 0.01)}
      </Group>
      <Group label="DECK · LIGHT">
        {S("azimuth — 90 is down", "lightAzimuth", 0, 180, 1, "°")}
        {S("distance", "lightDistance", 1, 40, 0.5)}
        {S("elevation · front", "lightElevationFront", 0, 0.6, 0.005)}
        {S("elevation · back", "lightElevationBack", 0, 0.6, 0.005)}
        {S("brightness · front", "lightBrightnessFront", 0, 0.5, 0.005)}
        {S("brightness · back", "lightBrightnessBack", 0, 0.5, 0.005)}
        {S("softness — 1 is the plugin", "lightSoftness", 0.5, 6, 0.1, "×")}
        {S("side face", "lightSide", 0, 3, 0.05, "×")}
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
