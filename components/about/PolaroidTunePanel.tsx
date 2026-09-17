"use client";

import { useEffect, useState } from "react";
import {
  flipPolaroid,
  replayPolaroid,
  polaroidTune,
  polaroidTuneChanges,
  polaroidTuneSource,
  resetPolaroidTune,
  setPolaroidTune,
  subscribePolaroidTune,
  type PolaroidTune,
} from "@/lib/polaroidTuning";

/**
 * Live controls for the Polaroid's turn, curl and shadow.
 *
 * Off unless asked for: `?tune` on the About URL, or press `H`, the same
 * key as the home page's panel. Flip turns
 * the print with the current values; the copy buttons print what has moved,
 * or everything shaped for `polaroid.ts`.
 */
export default function PolaroidTunePanel() {
  const [open, setOpen] = useState(false);
  const [, bump] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);
  const [fallback, setFallback] = useState<string | null>(null);

  useEffect(() => subscribePolaroidTune(() => bump((n) => n + 1)), []);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("tune")) setOpen(true);
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)))
        return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "h" || e.key === "H") setOpen((v) => !v);
      if ((e.key === "f" || e.key === "F") && open) flipPolaroid();
      if ((e.key === "r" || e.key === "R") && open) replayPolaroid();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  const copy = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 1200);
    } catch {
      setFallback(text);
    }
  };

  type NumKey = { [K in keyof PolaroidTune]: PolaroidTune[K] extends number ? K : never }[keyof PolaroidTune];
  const S = (name: string, key: NumKey, min: number, max: number, step: number, unit?: string) => (
    <Slider
      key={key}
      name={name}
      unit={unit}
      min={min}
      max={max}
      step={step}
      value={polaroidTune[key]}
      onChange={(v) => setPolaroidTune({ [key]: v })}
    />
  );

  return (
    <div style={panel}>
      <div style={head}>
        <span>ABOUT · POLAROID</span>
        <button style={ghost} onClick={() => setOpen(false)}>hide · H</button>
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
        <button style={{ ...ghost, flex: 1, background: "rgba(160,220,150,.18)" }} onClick={flipPolaroid}>
          flip · F
        </button>
        <button style={{ ...ghost, flex: 1, background: "rgba(160,220,150,.18)" }} onClick={replayPolaroid}>
          arrive · R
        </button>
        <button style={ghost} onClick={resetPolaroidTune}>reset</button>
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
        <button style={{ ...ghost, flex: 1 }} onClick={() => copy("changes", polaroidTuneChanges() || "(nothing changed)")}>
          {copied === "changes" ? "copied" : "copy changes"}
        </button>
        <button style={{ ...ghost, flex: 1 }} onClick={() => copy("source", polaroidTuneSource())}>
          {copied === "source" ? "copied" : "copy polaroid.ts"}
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

      <Group label="ARRIVAL">
        {S("delay before it starts", "entryDelay", 0, 2, 0.05, "s")}
        {S("scale from", "entryFromScale", 0.5, 1.3, 0.01, "×")}
        {S("scale stiffness", "entryScaleStiffness", 10, 300, 1)}
        {S("scale damping ratio", "entryScaleRatio", 0.1, 2, 0.01)}
        {S("fade stiffness", "entryFadeStiffness", 10, 400, 1)}
        {S("curl from — multiple of rest", "entryFromCurl", 0, 2, 0.05, "×")}
        {S("curl kick — upward, per s", "entryCurlKick", 0, 40, 0.5)}
        {S("curl stiffness", "entryCurlStiffness", 10, 300, 1)}
        {S("curl damping ratio", "entryCurlRatio", 0.1, 2, 0.01)}
      </Group>
      <Group label="THE TURN">
        <button
          onClick={() => setPolaroidTune({ flipDir: polaroidTune.flipDir === 1 ? -1 : 1 })}
          style={{ ...ghost, width: "100%", marginBottom: 7, textAlign: "left" }}
        >
          <span style={{ opacity: 0.5 }}>◉</span> direction — {polaroidTune.flipDir === 1 ? "left edge leads" : "right edge leads"}
        </button>
        {S("top edge stiffness", "topStiffness", 10, 300, 1)}
        {S("top edge damping ratio", "topRatio", 0.1, 2, 0.01)}
        {S("bottom edge stiffness", "bottomStiffness", 10, 300, 1)}
        {S("bottom edge damping ratio", "bottomRatio", 0.1, 2, 0.01)}
        {S("lift toward camera", "lift", 0, 1, 0.01, "cards")}
      </Group>
      <Group label="FLEX">
        {S("stiffness", "flexStiffness", 10, 300, 1)}
        {S("damping ratio", "flexRatio", 0.1, 2, 0.01)}
        {S("kick on turn", "flexKickTurn", -6, 6, 0.1)}
        {S("kick on landing", "flexKickLand", -6, 6, 0.1)}
      </Group>
      <Group label="CURL · BOTTOM-RIGHT CORNER">
        {S("at rest, picture up", "curl", 0, 2.5, 0.01, "rad")}
        {S("fold in from the corner", "curlLength", 0.1, 1.4, 0.01, "cards")}
        {S("extra through the turn", "curlThrough", 0, 2.5, 0.01, "rad")}
      </Group>
      <Group label="HOVER">
        <button
          onClick={() => setPolaroidTune({ tiltToward: polaroidTune.tiltToward === 1 ? -1 : 1 })}
          style={{ ...ghost, width: "100%", marginBottom: 7, textAlign: "left" }}
        >
          <span style={{ opacity: 0.5 }}>◉</span> {polaroidTune.tiltToward === 1 ? "drawn toward the pointer" : "pushed away by the pointer"}
        </button>
        {S("tilt at the edge", "tiltMax", 0, 0.3, 0.005, "rad")}
      </Group>
      <Group label="SHADOW">
        {S("throw per height", "shadowThrow", 0, 4, 0.05, "×")}
        {S("softness", "shadowSoft", 0.2, 3, 0.05, "×")}
        {S("alpha", "shadowAlpha", 0, 2, 0.05, "×")}
      </Group>
    </div>
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
