"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { animate, motionValue, useAnimationFrame, useReducedMotion } from "motion/react";
import { heroSpring, heroTune as T } from "@/lib/heroTuning";

/**
 * The hero sentence, typed in behind a cursor. See HERO_TYPE in design.ts;
 * the live values come from the tuning store so the panel can move them.
 *
 * The text is real and laid out normally; the reveal is a clip-path on the
 * block around it, shaped as a staircase: every line above the cursor's
 * line in full, the cursor's line up to the cursor, nothing below. One
 * number drives it — a position along the lines laid end to end — so the
 * typing, the hold and the sweep are the same value moving at different
 * speeds. The line boxes come from the browser, so it follows whatever
 * wrapping the width gives.
 *
 * The cursor sits OUTSIDE the clipped block, as its sibling, or the clip
 * would cut it at its own leading edge. It is a block whose leading edge is
 * the position and whose trailing edge chases it; the gap is the smear. It
 * is seated on the baseline, found with a zero-size inline probe, rather
 * than on the font's content box, which reaches well above the capitals.
 *
 * The words come in against it: as the cursor reaches a word's left edge
 * the word springs in from the right. The typed word does not — it was
 * typed.
 *
 * The particle layer — the ripple as the deck rises and the hover field —
 * is parked, not deleted. `HeroPixels.tsx` and its settings in HERO_TYPE are
 * still in the repo; nothing mounts them. Bringing it back means rendering
 * <HeroPixels> as the last child of the outer span, handing it that span as
 * `host`, and restoring the hover and ripple calls that fed it.
 */
type Line = { top: number; bottom: number; left: number; right: number };
type Word = { el: HTMLElement; line: number; left: number; started: boolean };

export default function HeroType({
  play,
  typed,
  words,
  onDone,
}: {
    /** False shows the resting sentence with no cursor. */
    play: boolean;
    /** The leading text, typed a character at a time. */
    typed: string;
    /** The rest, a node per word. Each arrives as the cursor reaches it. */
    words: ReactNode[];
    onDone: () => void;
}) {
  const outer = useRef<HTMLSpanElement>(null);
  const box = useRef<HTMLSpanElement>(null);
  const cursor = useRef<HTMLSpanElement>(null);
  const probe = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion() ?? false;
  const done = useRef(onDone);
  done.current = onDone;
  const run = play && !reduced;

  const lines = useRef<Line[]>([]);
  const chars = useRef<number[]>([]);
  const wordList = useRef<Word[]>([]);
  const width = useRef(0);
  /** Baseline of a line, as an offset from that line's top. */
  const baseline = useRef(0);
  const em = useRef(16);

  /** Position along the unrolled lines: line index + fraction across it. */
  const pos = useRef(motionValue(0));
  /** Smear state: last leading-edge x, its line, smoothed speed (em/s),
   *  and the tail's current length (px). */
  const trail = useRef({ line: -1, x: 0, v: 0, len: 0 });
  const cursorOn = useRef(motionValue(1));
  const active = useRef(false);
  const lastT = useRef(0);

  const measure = () => {
    const el = box.current;
    if (!el) return;
    const b = el.getBoundingClientRect();
    width.current = b.width;
    em.current = parseFloat(getComputedStyle(el).fontSize);

    /* Line boxes: every fragment in the block, merged by vertical position. */
    const range = document.createRange();
    range.selectNodeContents(el);
    const out: Line[] = [];
    for (const r of Array.from(range.getClientRects())) {
      if (r.width < 1 || r.height < 1) continue;
      const top = r.top - b.top, bottom = r.bottom - b.top;
      const left = r.left - b.left, right = r.right - b.left;
      const hit = out.find((l) => Math.abs(l.top - top) < r.height * 0.5);
      if (hit) {
        hit.left = Math.min(hit.left, left);
        hit.right = Math.max(hit.right, right);
        hit.top = Math.min(hit.top, top);
        hit.bottom = Math.max(hit.bottom, bottom);
      } else out.push({ top, bottom, left, right });
    }
    out.sort((a, c) => a.top - c.top);
    lines.current = out;

    /* The baseline: the probe is a zero-height inline-block, whose bottom
     * sits exactly on it. */
    if (probe.current && out.length) {
      const pr = probe.current.getBoundingClientRect();
      baseline.current = pr.bottom - b.top - out[0].top;
    }

    /* Typed characters: the right edge of each prefix of the first text. */
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let text = walker.nextNode() as Text | null;
    while (text && text.length === 0) text = walker.nextNode() as Text | null;
    chars.current = [];
    if (text) {
      for (let i = 1; i <= Math.min(typed.length, text.length); i++) {
        const r = document.createRange();
        r.setStart(text, 0);
        r.setEnd(text, i);
        chars.current.push(r.getBoundingClientRect().right - b.left);
      }
    }

    /* Words: which line each is on, and where it starts. */
    const started = new Map(wordList.current.map((w) => [w.el, w.started]));
    wordList.current = Array.from(el.querySelectorAll<HTMLElement>("[data-word]")).map((w) => {
      const r = w.getBoundingClientRect();
      const top = r.top - b.top;
      let line = 0;
      for (let i = 0; i < out.length; i++)
        if (top >= out[i].top - 1) line = i;
      return { el: w, line, left: r.left - b.left, started: started.get(w) ?? false };
    });
  };

  const xAt = (line: Line, f: number) => line.left + (line.right - line.left) * f;

  /** Start a word's entrance. */
  const enter = (w: Word) => {
    w.started = true;
    const e = em.current;
    setTimeout(() => {
      animate(
        w.el,
        { x: [T.wordTravel * e, 0] },
        heroSpring(T.wordStiffness, T.wordRatio, T.wordMass),
      );
      animate(w.el, { opacity: [0, 1] }, { duration: Math.max(0.001, T.wordFade), ease: "easeOut" });
    }, T.wordDelay * 1000);
  };

  const paint = (t: number) => {
    const el = box.current, cu = cursor.current;
    const L = lines.current;
    if (!el || !cu || L.length === 0) return;
    const p = pos.current.get();
    const li = Math.min(L.length - 1, Math.max(0, Math.floor(p)));
    const line = L[li];
    const x = xAt(line, Math.min(1, p - li));

    /* The smear, from speed. A new line is a new start with no tail. */
    const dt = lastT.current ? (t - lastT.current) / 1000 : 0;
    lastT.current = t;
    const em0 = em.current;
    const s = trail.current;
    if (s.line !== li) {
      trail.current = { line: li, x, v: 0, len: 0 };
    } else if (dt > 0) {
      const vInst = Math.abs(x - s.x) / dt / em0;
      s.v += (vInst - s.v) * (T.smearRise > 0 ? 1 - Math.exp(-dt / T.smearRise) : 1);
      const want = Math.max(0, s.v - T.smearThreshold) * T.smearGain * em0;
      /* Grows at once, shrinks on the relax clock. */
      s.len =
        want > s.len
          ? want
          : s.len + (want - s.len) * (T.smearRelax > 0 ? 1 - Math.exp(-dt / T.smearRelax) : 1);
      s.x = x;
    }
    const tx = x - trail.current.len;

    /* Staircase clip: lines above in full, this one to x, none below. */
    const W = width.current;
    el.style.clipPath =
      `polygon(0px 0px, ${W}px 0px, ${W}px ${line.top}px, ${x}px ${line.top}px, ` +
      `${x}px ${line.bottom}px, 0px ${line.bottom}px)`;

    /* Words the cursor has reached come in. */
    for (const w of wordList.current) {
      if (w.started) continue;
      if (w.line < li || (w.line === li && x >= w.left)) enter(w);
    }

    /* The cursor: leading edge at x, trailing edge at tx, on the baseline. */
    const e = em.current;
    const cw = T.cursorWidth * e;
    const w = Math.max(cw, x - tx + cw);
    const top = line.top + baseline.current - T.cursorAbove * e;
    const nudge = T.cursorOffset * e;
    cu.style.transform = `translate(${x + nudge + cw - w}px, ${top}px)`;
    cu.style.width = `${w}px`;
    cu.style.height = `${(T.cursorAbove + T.cursorBelow) * e}px`;
    cu.style.opacity = String(cursorOn.current.get());
  };

  useAnimationFrame((t) => {
    if (active.current) paint(t);
  });

  useEffect(() => {
    const el = box.current, cu = cursor.current;
    if (!el || !cu) return;
    const wordEls = Array.from(el.querySelectorAll<HTMLElement>("[data-word]"));
    if (!run) {
      el.style.clipPath = "none";
      cu.style.display = "none";
      for (const w of wordEls) {
        w.style.opacity = "1";
        w.style.transform = "none";
      }
      done.current();
      return;
    }

    let cancelled = false;
    const wait = (s: number) => new Promise<void>((r) => setTimeout(r, s * 1000));
    const controls: { stop: () => void }[] = [];

    /* Carry the block so the typed word sits in the middle of the line. */
    const centre = () => {
      if (!outer.current || !chars.current.length) return;
      const l0 = lines.current[0];
      const typedCentre = (l0.left + chars.current[chars.current.length - 1]) / 2;
      outer.current.style.transform = `translateX(${width.current / 2 - typedCentre}px)`;
    };

    const sequence = async () => {
      await document.fonts?.ready;
      /* The stage settles its width just after mount; wait a frame for it. */
      await new Promise((r) => requestAnimationFrame(r));
      measure();
      if (lines.current.length === 0 || cancelled) return;
      active.current = true;
      pos.current.set(0);
      trail.current = { line: 0, x: lines.current[0].left, v: 0, len: 0 };
      centre();

      /* The cursor, blinking on the empty line. Blink is a square wave. */
      const blink = animate(cursorOn.current, [1, 1, 0, 0], {
        duration: T.blink,
        times: [0, 0.5, 0.5, 1],
        ease: "linear",
        repeat: Infinity,
      });
      controls.push(blink);
      await wait(T.lead + T.blinkIn);
      if (cancelled) return;

      /* Typed, a character at a time, centred on the line: the whole block
       * is carried over so the typed word sits in the middle, and it slides
       * to its seat when the sweep begins. The cursor holds solid while
       * typing. */
      measure();
      centre();
      blink.pause();
      cursorOn.current.set(1);
      const first = lines.current[0];
      const span = first.right - first.left;
      for (const cx of chars.current) {
        pos.current.set((cx - first.left) / span);
        await wait(T.perChar);
        if (cancelled) return;
      }

      /* The beat. */
      blink.play();
      await wait(T.hold);
      if (cancelled) return;
      blink.pause();
      cursorOn.current.set(1);

      /* The line gives up the centre, and the sweep follows a breath later. */
      if (outer.current) {
        const c = animate(
          outer.current,
          { x: 0 },
          heroSpring(T.slideStiffness, T.slideRatio, T.slideMass),
        );
        controls.push(c);
      }
      await wait(T.slideLead);
      if (cancelled) return;

      /* The sweep, line by line. Each line takes time in proportion to how
       * much of it is left. */
      measure();
      const lineCount = lines.current.length;
      for (let i = 0; i < lineCount; i++) {
        const from = i === 0 ? pos.current.get() : i;
        const dur = T.sweep * (1 - (from - i));
        const c =
          T.sweepMode === "spring"
            ? animate(pos.current, i + 1, heroSpring(T.sweepStiffness, T.sweepRatio, T.sweepMass))
            : animate(pos.current, [from, i + 1], { duration: dur, ease: T.sweepEase });
        controls.push(c);
        await c;
        if (cancelled) return;
        if (i < lineCount - 1) {
          pos.current.set(i + 1);
          await wait(T.lineGap);
          if (cancelled) return;
        }
      }
      /* All in. Hold the beat, then hand over to the deal. */
      blink.play();
      await wait(T.holdIn);
      if (cancelled) return;
      done.current();

      /* The cursor blinks out and leaves. */
      await wait(Math.max(0, T.blinkOut - T.holdIn));
      if (cancelled) return;
      blink.stop();
      await animate(cursorOn.current, 0, { duration: T.fadeOut, ease: "easeOut" });
      active.current = false;
      el.style.clipPath = "none";
      cu.style.display = "none";
    };
    void sequence();

    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    return () => {
      cancelled = true;
      controls.forEach((c) => c.stop());
      window.removeEventListener("resize", onResize);
    };
    // Plays once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  const hidden = run ? { opacity: 0 } : undefined;

  return (
    <span
      ref={outer}
      style={{ display: "block", position: "relative" }}
    >
      <span
        ref={box}
        style={{
          display: "block",
          /* Nothing shows until the first frame has measured and clipped. */
          clipPath: run ? "polygon(0 0, 0 0, 0 0)" : undefined,
        }}
      >
        <span ref={probe} style={{ display: "inline-block", width: 0, height: 0 }} />
        <span data-typed>{typed}</span>
        {words.map((w, i) => (
          <span key={i}>
            {" "}
            <span data-word style={{ display: "inline-block", ...hidden }}>
              {w}
            </span>
          </span>
        ))}
      </span>
      <span
        ref={cursor}
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          background: "var(--ink)",
          opacity: 0,
          pointerEvents: "none",
          willChange: "transform, width",
          display: run ? undefined : "none",
        }}
      />
    </span>
  );
}
