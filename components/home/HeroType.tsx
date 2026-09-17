"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { animate, motionValue, useAnimationFrame, useReducedMotion } from "motion/react";
import { HERO_TYPE } from "@/lib/design";
import { heroRead, heroSpring, heroTune as T } from "@/lib/heroTuning";

/**
 * The hero sentence, typed in behind a cursor. See HERO_TYPE in design.ts;
 * the live values come from the tuning store so the panel can move them.
 *
 * The text is real and laid out normally; the reveal on the sweep is a
 * clip-path on the block around it, shaped as a staircase: every line
 * above the cursor's line in full, the cursor's line up to the cursor,
 * nothing below. One number drives it — a position along the lines laid
 * end to end. The line boxes come from the browser, so it follows whatever
 * wrapping the width gives.
 *
 * Typing does not clip. A glyph's ink is not its advance — the arm of a y
 * reaches past where the next letter starts — so a clip at the advance
 * cuts the letter and a clip any further right shows a sliver of the next
 * one. The typed characters are each their own span and are shown whole,
 * one at a time; the clip only takes over when the sweep begins.
 *
 * The cursor sits OUTSIDE the clipped block, as its sibling, or the clip
 * would cut it at its own leading edge. It is a block whose leading edge is
 * the position and whose trailing edge chases it; the gap is the smear. It
 * is seated on the baseline, found with a zero-size inline probe, rather
 * than on the font's content box, which reaches well above the capitals.
 *
 * The words come in against it: as the reveal edge reaches a word's seat
 * the word springs in from the right. The typed word does not — it was
 * typed.
 *
 * The particle layer — the ripple as the deck rises and the hover field —
 * is parked, not deleted. `HeroPixels.tsx` and its settings in HERO_TYPE are
 * still in the repo; nothing mounts them. Bringing it back means rendering
 * <HeroPixels> as the last child of the outer span, handing it that span as
 * `host`, and restoring the hover and ripple calls that fed it.
 */
/** A line's reveal band, its horizontal extent, and the top of its text's
 *  content box — which is what the cursor is seated against. */
type Line = { top: number; bottom: number; left: number; right: number; text: number };
type Word = { el: HTMLElement; line: number; left: number; started: boolean };

export default function HeroType({
  play,
  typed,
  words,
  centre: centreFrac = 1,
  onDone,
}: {
    /** False shows the resting sentence with no cursor. */
    play: boolean;
    /** The leading text, typed a character at a time. */
    typed: string;
    /** The rest, a node per word. Each arrives as the cursor reaches it. */
    words: ReactNode[];
    /** How far the typed word is carried toward the middle, 0–1. See
     *  HERO_TYPE.centre. */
    centre?: number;
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
  /**
   * Whether the cursor is sweeping or typing. The nudge means two things:
   * while typing it is the gap after the last letter, and the reveal stays
   * at the letter's edge; on the sweep the reveal has to ride the cursor
   * itself, or a nudge of any size opens a strip of bare page between the
   * text and the cursor's trailing edge.
   */
  const sweeping = useRef(false);
  const lastT = useRef(0);

  const measure = () => {
    const el = box.current;
    if (!el) return;
    /* Measured at rest: a word mid-arrival is translated right, and the
     * line's right edge would be measured a travel too far, which is where
     * the cursor would then stop. */
    const wordEls = Array.from(el.querySelectorAll<HTMLElement>("[data-word]"));
    const saved = wordEls.map((w) => w.style.transform);
    for (const w of wordEls) w.style.transform = "none";
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
      } else out.push({ top, bottom, left, right, text: top });
    }
    out.sort((a, c) => a.top - c.top);
    /* Each line's band runs from midway above it to midway below, and the
     * last to the bottom of the block. The rects are the text's content
     * boxes, and a descender can reach past one — the g in "Remington" was
     * cut off below its line while the cursor was on that line, and came
     * back when the line was released in full. */
    const h = b.height;
    const bands = out.map((l, i) => ({
      ...l,
      text: l.top,
      top: i === 0 ? 0 : (out[i - 1].bottom + l.top) / 2,
      bottom: i === out.length - 1 ? Math.max(h, l.bottom) + 2 : (l.bottom + out[i + 1].top) / 2,
    }));
    lines.current = bands;

    /* The baseline: the probe is a zero-height inline-block, whose bottom
     * sits exactly on it. Kept as an offset from the line's content top,
     * which is the same on every line. */
    if (probe.current && out.length) {
      const pr = probe.current.getBoundingClientRect();
      baseline.current = pr.bottom - b.top - out[0].top;
    }

    /* Typed characters: the right edge of each. */
    chars.current = Array.from(el.querySelectorAll<HTMLElement>("[data-char]")).map(
      (c) => c.getBoundingClientRect().right - b.left,
    );

    /* Words: which line each is on, and where its seat is. */
    const started = new Map(wordList.current.map((w) => [w.el, w.started]));
    wordList.current = wordEls.map((w) => {
      const r = w.getBoundingClientRect();
      const mid = (r.top + r.bottom) / 2 - b.top;
      let line = 0;
      for (let i = 0; i < bands.length; i++)
        if (mid >= bands[i].top) line = i;
      return { el: w, line, left: r.left - b.left, started: started.get(w) ?? false };
    });
    wordEls.forEach((w, i) => (w.style.transform = saved[i]));
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
      heroRead.peakSpeed = Math.max(heroRead.peakSpeed, s.v);
      heroRead.peakTail = Math.max(heroRead.peakTail, s.len / em0);
    }
    const tx = x - trail.current.len;
    const nudge = T.cursorOffset * em0;
    const W = width.current;
    if (sweeping.current) {
      /* The reveal edge is the cursor's trailing edge. Staircase clip:
       * lines above in full, this one to rx, none below. */
      const rx = x + nudge;
      el.style.clipPath =
        `polygon(0px 0px, ${W}px 0px, ${W}px ${line.top}px, ${rx}px ${line.top}px, ` +
        `${rx}px ${line.bottom}px, 0px ${line.bottom}px)`;

      /* Words the reveal edge has reached come in. */
      for (const w of wordList.current) {
        if (w.started) continue;
        if (w.line < li || (w.line === li && rx >= w.left)) enter(w);
      }
    } else {
      /* Typing: nothing is clipped. The words are not in yet, and the
       * typed characters show themselves. */
      el.style.clipPath = "none";
    }

    /* The cursor: leading edge at x, trailing edge at tx, on the baseline. */
    const e = em.current;
    const cw = T.cursorWidth * e;
    const w = Math.max(cw, x - tx + cw);
    const top = line.text + baseline.current - T.cursorAbove * e;
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
      for (const c of Array.from(el.querySelectorAll<HTMLElement>("[data-char]")))
        c.style.visibility = "visible";
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

    /**
     * Carry the block so what has been typed so far sits in the middle of
     * the line: with nothing typed the cursor itself is dead centre, and
     * each character re-centres the word, so "Hey," steps left as it grows
     * rather than starting off-centre to leave room for itself.
     *
     * A hard cut per character, not a slide — exactly what centred text
     * does as it is typed. Set through `animate` at zero duration so the
     * library's own idea of the block's x agrees with the slide that later
     * carries the line to its seat; a raw style write would leave that
     * spring starting from wherever it last thought the block was.
     */
    const centre = (count: number) => {
      if (!outer.current || !lines.current.length) return;
      const l0 = lines.current[0];
      const right = count > 0 ? chars.current[Math.min(count, chars.current.length) - 1] : l0.left;
      const x = (width.current / 2 - (l0.left + right) / 2) * centreFrac;
      animate(outer.current, { x }, { duration: 0 });
    };

    const sequence = async () => {
      await document.fonts?.ready;
      /**
       * The stage settles its layout over the first few frames after mount,
       * and a cursor seated against a line that then moves is seen to jump.
       * Measure until two consecutive frames agree on where the block is,
       * and only then show anything.
       */
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      let prev = "";
      for (let k = 0; k < 12; k++) {
        await frame();
        if (cancelled || !box.current) return;
        const b = box.current.getBoundingClientRect();
        const key = `${b.top.toFixed(1)}:${b.left.toFixed(1)}:${b.width.toFixed(1)}:${b.height.toFixed(1)}`;
        if (key === prev) break;
        prev = key;
      }
      measure();
      if (lines.current.length === 0 || cancelled) return;
      active.current = true;
      heroRead.peakSpeed = 0;
      heroRead.peakTail = 0;
      pos.current.set(0);
      trail.current = { line: 0, x: lines.current[0].left, v: 0, len: 0 };
      centre(0);

      /* The cursor's blink, a square wave. Started fresh each time it is
       * wanted and stopped outright when it is not, rather than paused and
       * resumed: a paused loop could still write over the solid value, and
       * where it had stopped in its cycle decided whether the cursor showed
       * during the sweep. */
      sweeping.current = false;
      const blinkRef: { current: { stop: () => void } | null } = { current: null };
      const blinkOn = () => {
        blinkRef.current?.stop();
        blinkRef.current = animate(cursorOn.current, [1, 1, 0, 0], {
          duration: T.blink,
          times: [0, 0.5, 0.5, 1],
          ease: "linear",
          repeat: Infinity,
        });
        controls.push(blinkRef.current);
      };
      const blinkOff = () => {
        blinkRef.current?.stop();
        blinkRef.current = null;
        cursorOn.current.set(1);
      };
      blinkOn();
      await wait(T.lead + T.blinkIn);
      if (cancelled) return;

      /* Typed, a character at a time, centred on the line: the whole block
       * is carried over so the typed word sits in the middle, and it slides
       * to its seat when the sweep begins. The cursor holds solid while
       * typing. */
      measure();
      centre(0);
      blinkOff();
      const first = lines.current[0];
      const span = first.right - first.left;
      const charEls = Array.from(el.querySelectorAll<HTMLElement>("[data-char]"));
      for (let i = 0; i < chars.current.length; i++) {
        charEls[i].style.visibility = "visible";
        pos.current.set((chars.current[i] - first.left) / span);
        centre(i + 1);
        await wait(T.perChar);
        if (cancelled) return;
      }

      /* The beat. */
      blinkOn();
      await wait(T.hold);
      if (cancelled) return;
      blinkOff();

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
       * much of it is left.
       *
       * One motion across every line, not one per line. The authored curve
       * starts from rest and settles at the end; run on each line in turn
       * the cursor came to a stop at every line end and pulled away from
       * rest at every line start, and the words either side of the break
       * arrived a beat apart. So the curve's ease-in belongs to the first
       * line only and its ease-out to the last; in between, and at the
       * inner end of each, the cursor is at speed. */
      measure();
      sweeping.current = true;
      const lineCount = lines.current.length;
      const [x1, y1, x2, y2] = T.sweepEase;
      for (let i = 0; i < lineCount; i++) {
        const from = i === 0 ? pos.current.get() : i;
        /* Time in proportion to the line's length in em, against the line
         * the sweep is authored for, and to how much of it is left. */
        const ln = lines.current[i];
        const lineEm = (ln.right - ln.left) / em.current;
        const dur = T.sweep * (lineEm / HERO_TYPE.sweepLineEm) * (1 - (from - i));
        const last = i === lineCount - 1;
        const ease: [number, number, number, number] = [
          i === 0 ? x1 : 0,
          i === 0 ? y1 : 0,
          last ? x2 : 1,
          last ? y2 : 1,
        ];
        const c =
          T.sweepMode === "spring"
            ? animate(pos.current, i + 1, heroSpring(T.sweepStiffness, T.sweepRatio, T.sweepMass))
            : animate(pos.current, [from, i + 1], { duration: dur, ease });
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
      blinkOn();
      await wait(T.holdIn);
      if (cancelled) return;
      done.current();

      /* The cursor blinks out and leaves. */
      await wait(Math.max(0, T.blinkOut - T.holdIn));
      if (cancelled) return;
      blinkRef.current?.stop();
      blinkRef.current = null;
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
        <span data-typed>
          {Array.from(typed).map((c, i) => (
            <span key={i} data-char style={run ? { visibility: "hidden" } : undefined}>
              {c}
            </span>
          ))}
        </span>
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
          /* Above the words, which spring in on their own transforms. */
          zIndex: 1,
          willChange: "transform, width",
          display: run ? undefined : "none",
        }}
      />
    </span>
  );
}
