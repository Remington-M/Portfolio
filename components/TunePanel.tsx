"use client";

import { useEffect, useRef, useState } from "react";
import {
  derived as tuned,
  resetTuning,
  setTuning,
  subscribeTuning,
  tuning,
  tuningSource,
} from "@/lib/tuning";

/**
 * Live controls for the shot transition.
 *
 * Off unless asked for: add `?tune` to any project URL, or press `T`. It is
 * never in the DOM otherwise, so it cannot be stumbled into.
 *
 * It writes to the tuning store rather than to React state, and the media layer
 * reads that store every frame — so a slider takes effect on the very next
 * transition with no reload. What it does NOT do is persist: tuning ends with
 * the copy button, which prints the values shaped as the `design.ts` they came
 * from, ready to paste back.
 */
export default function TunePanel() {
  const [open, setOpen] = useState(false);
  const [, bump] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => subscribeTuning(() => bump((n) => n + 1)), []);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("tune")) setOpen(true);
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)))
        return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "t" || e.key === "T") setOpen((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!open) return null;

  // What the current numbers actually produce, for a full-width push on a
  // 520px frame — the abstract knobs above turned into the two quantities
  // anyone actually cares about.
  const enter = 520 * tuning.pushMax;
  const landing = (enter * tuned.exitSlope) / (tuning.pushMs / 1000);
  // Velocity into the spring, converted to the peak it reaches — `carryRate`
  // is excursion per unit of release velocity, so dividing by it undoes the
  // same conversion the cap is expressed in.
  const excursion = Math.min(
    tuning.maxPx,
    (landing * tuning.transfer) / tuned.carryRate,
  );

  return (
    <div style={panel}>
      <div style={head}>
        <span>SHOT TRANSITION</span>
        <button style={ghost} onClick={() => setOpen(false)}>
          hide · T
        </button>
      </div>

      <Group label="VIEWER">
        <Toggle
          on={!tuning.frameFixed}
          onClick={() => setTuning({ frameFixed: !tuning.frameFixed })}
          labelOn="morphs to each clip"
          labelOff="fixed window, clips fit inside"
        />
        <Toggle
          on={tuning.contentFixed}
          onClick={() => setTuning({ contentFixed: !tuning.contentFixed })}
          labelOn="content holds its size"
          labelOff="content scales with viewer"
        />
        <Toggle
          on={tuning.morphOnPush}
          onClick={() => setTuning({ morphOnPush: !tuning.morphOnPush })}
          labelOn="morph on the push's clock"
          labelOff="morph on its own spring"
        />
        {tuning.morphOnPush ? (
          <>
            <Slider name="morph span" unit="× push" min={0.2} max={1} step={0.01}
              value={tuning.morphSpan}
              onChange={(v) => setTuning({ morphSpan: v })} />
            <Note>
              {tuning.morphSpan >= 0.995
                ? "in lockstep with the picture"
                : `shape lands at ${Math.round(tuning.morphSpan * tuning.pushMs)}ms, picture at ${Math.round(tuning.pushMs)}ms — bare viewer may show at the trailing edge when the frame is GROWING`}
            </Note>
          </>
        ) : (
          <Note>
            SPRING.morph, independent of the push. Watch for the frame
            outrunning the clips.
          </Note>
        )}
        <Note>
          {tuning.frameFixed
            ? "no resize between shots — the push carries it alone. Portrait clips sit letterboxed."
            : tuning.contentFixed
              ? "the morph is a mask opening over a still picture, not a zoom"
              : "the picture grows with the viewer — a resize, a zoom and a slide on one beat"}
        </Note>
      </Group>

      <Group label="PUSH">
        <Toggle
          on={tuning.pushOn}
          onClick={() => setTuning({ pushOn: !tuning.pushOn })}
          labelOn="on — push + carry"
          labelOff="off — morph only"
        />
        <Slider name="duration" unit="ms" min={80} max={900} step={10}
          value={tuning.pushMs} onChange={(v) => setTuning({ pushMs: v })} />
        <Slider name="play delay" unit="ms" min={0} max={1200} step={20}
          value={tuning.playDelay} onChange={(v) => setTuning({ playDelay: v })} />
        <Slider name="travel" unit="× viewer" min={0} max={1} step={0.01}
          value={tuning.pushMax} onChange={(v) => setTuning({ pushMax: v })} />
        <Slider name="travel floor" unit="× viewer" min={0} max={1} step={0.01}
          value={tuning.pushMin} onChange={(v) => setTuning({ pushMin: v })} />
        <Slider name="aspect falloff" unit="ln" min={0.05} max={1.5} step={0.01}
          value={tuning.pushFalloff} onChange={(v) => setTuning({ pushFalloff: v })} />
        <Note>
          {tuning.contentFixed && tuning.pushMax > 0.01
            ? `1.00 = a full push, out of sight. Lower keeps the two clips overlapping longer.`
            : null}
        </Note>
        <Note>
          {!tuning.pushOn
            ? "nothing but the morph — the shape change carries it alone"
            : tuning.pushMin >= tuning.pushMax
              ? "floor = distance: every change pushes the same, however far the aspect turns"
              : tuning.pushMin === 0
                ? "floor 0: a big turn of aspect gets no push at all, the morph has it"
                : "floor is what a big turn of aspect still gets — the morph does the rest"}
        </Note>
      </Group>

      <Group label="ARRIVAL CURVE">
        <CurveEditor />
        <Readout
          name="handles"
          value={tuning.ease.map((n) => n.toFixed(2)).join(", ")}
        />
        <Readout
          name="exit slope"
          value={`${tuned.exitSlope.toFixed(2)}× — the handoff`}
        />
      </Group>

      <Group label="CARRY">
        <Slider name="transfer" min={0} max={1} step={0.01}
          value={tuning.transfer} onChange={(v) => setTuning({ transfer: v })} />
        <Slider name="max travel" unit="px" min={0} max={120} step={1}
          value={tuning.maxPx} onChange={(v) => setTuning({ maxPx: v })} />
        <Slider name="stiffness" min={20} max={600} step={5}
          value={tuning.stiffness} onChange={(v) => setTuning({ stiffness: v })} />
        <Slider name="damping ratio" min={0.15} max={1.4} step={0.01}
          value={tuning.ratio} onChange={(v) => setTuning({ ratio: v })} />
        <Note>
          {tuning.ratio < 0.999
            ? `overshoots — rings back past centre`
            : `no overshoot`}
        </Note>
      </Group>

      <Group label="ON A 520px FRAME">
        <Readout name="clip lands at" value={`${Math.round(landing)} px/s`} />
        <Readout name="viewer travels" value={`${excursion.toFixed(1)} px`} />
      </Group>

      <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
        <button
          style={{ ...ghost, flex: 1 }}
          onClick={() => {
            navigator.clipboard?.writeText(tuningSource());
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          }}
        >
          {copied ? "copied ✓" : "copy for design.ts"}
        </button>
        <button style={ghost} onClick={resetTuning}>
          reset
        </button>
      </div>
    </div>
  );
}

/**
 * The arrival curve, with handles.
 *
 * Drag P1 and P2 the way they drag anywhere else. Sliders were the wrong
 * instrument for this — four numbers that only mean something together, and no
 * way to feel the shape while changing it.
 *
 * The dashed orange line is the tangent where the curve lands. That slope IS
 * the handoff velocity, so it is drawn rather than merely reported: pulling P2
 * down and left steepens the arrival, and the whole carry gets stronger.
 *
 * Y runs past 0 and 1 on purpose. Overshooting the top means the picture
 * travels past its resting place and comes back, which is a legitimate thing
 * to want — though note that a curve ending on its way DOWN has a negative
 * exit slope, and the viewer will then be nudged the opposite way.
 */
const Y_MIN = -0.3;
const Y_MAX = 1.3;

function CurveEditor() {
  const [x1, y1, x2, y2] = tuning.ease;
  const [drag, setDrag] = useState<0 | 1 | null>(null);
  const ref = useRef<SVGSVGElement>(null);

  const W = 202;
  const PAD = 16;
  const S = W - PAD * 2;
  const px = (x: number) => PAD + x * S;
  const py = (y: number) => PAD + (1 - (y - Y_MIN) / (Y_MAX - Y_MIN)) * S;

  const move = (e: React.PointerEvent) => {
    if (drag === null || !ref.current) return;
    const b = ref.current.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - b.left - PAD) / S));
    const yRaw = 1 - (e.clientY - b.top - PAD) / S;
    const y = Math.min(
      Y_MAX,
      Math.max(Y_MIN, yRaw * (Y_MAX - Y_MIN) + Y_MIN),
    );
    const next = [...tuning.ease] as [number, number, number, number];
    next[drag * 2] = Math.round(x * 100) / 100;
    next[drag * 2 + 1] = Math.round(y * 100) / 100;
    setTuning({ ease: next });
  };

  const m = tuned.exitSlope;
  const tx = 0.72;

  return (
    <svg
      ref={ref}
      width={W}
      height={W}
      onPointerMove={move}
      onPointerUp={() => setDrag(null)}
      onPointerLeave={() => setDrag(null)}
      style={{ display: "block", margin: "2px 0 6px", touchAction: "none" }}
    >
      <rect x={0} y={0} width={W} height={W} fill="rgba(255,255,255,.04)" rx={4} />
      {/* The unit box the curve is defined in, so the overshoot range reads. */}
      <rect
        x={px(0)} y={py(1)} width={S} height={py(0) - py(1)}
        fill="none" stroke="rgba(255,255,255,.1)"
      />
      <line
        x1={px(0)} y1={py(0)} x2={px(1)} y2={py(1)}
        stroke="rgba(255,255,255,.14)" strokeDasharray="2 3"
      />
      {/* Tangent at the landing — the velocity being handed over. */}
      <line
        x1={px(tx)} y1={py(1 - m * (1 - tx))} x2={px(1)} y2={py(1)}
        stroke="rgba(255,176,84,.8)" strokeDasharray="3 2"
      />
      {/* Handle arms. */}
      <line x1={px(0)} y1={py(0)} x2={px(x1)} y2={py(y1)} stroke="rgba(255,255,255,.3)" />
      <line x1={px(1)} y1={py(1)} x2={px(x2)} y2={py(y2)} stroke="rgba(255,255,255,.3)" />
      <path
        d={`M${px(0)} ${py(0)} C ${px(x1)} ${py(y1)}, ${px(x2)} ${py(y2)}, ${px(1)} ${py(1)}`}
        fill="none" stroke="rgba(255,255,255,.92)" strokeWidth={1.6}
      />
      <circle cx={px(0)} cy={py(0)} r={2.5} fill="rgba(255,255,255,.5)" />
      <circle cx={px(1)} cy={py(1)} r={2.5} fill="rgba(255,255,255,.5)" />
      {([[x1, y1, 0], [x2, y2, 1]] as const).map(([hx, hy, i]) => (
        <circle
          key={i}
          cx={px(hx)}
          cy={py(hy)}
          r={drag === i ? 7 : 5.5}
          fill={drag === i ? "#ffb054" : "#f2ede3"}
          stroke="rgba(0,0,0,.35)"
          style={{ cursor: "grab" }}
          onPointerDown={(e) => {
            // Capture keeps the drag alive if the pointer leaves the handle,
            // but it is a nicety — a pointer id it will not accept must not
            // stop the drag from starting.
            try {
              (e.target as Element).setPointerCapture?.(e.pointerId);
            } catch {
              /* not capturable; the svg's own move handler still tracks it */
            }
            setDrag(i as 0 | 1);
          }}
        />
      ))}
    </svg>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ opacity: 0.4, letterSpacing: ".12em", fontSize: 9, marginBottom: 4 }}>
        {label}
      </div>
      {children}
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
        opacity: on ? 1 : 0.62,
      }}
    >
      <span style={{ opacity: 0.5 }}>{on ? "◉" : "○"}</span>{" "}
      {on ? labelOn : labelOff}
    </button>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ opacity: 0.42, fontSize: 9, lineHeight: 1.4, marginTop: 4 }}>
      {children}
    </div>
  );
}

function Readout({ name, value }: { name: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, padding: "1px 0" }}>
      <span style={{ opacity: 0.55 }}>{name}</span>
      <span>{value}</span>
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
          {step < 1 ? value.toFixed(2) : Math.round(value)}
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
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  letterSpacing: ".12em",
  fontSize: 9,
  opacity: 0.85,
};

const ghost: React.CSSProperties = {
  background: "rgba(255,255,255,.09)",
  border: 0,
  color: "inherit",
  font: "inherit",
  padding: "4px 7px",
  borderRadius: 5,
  cursor: "pointer",
};
