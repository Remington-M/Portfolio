"use client";

import { useEffect, useRef, type ReactNode } from "react";
import BangComma, { type BangCommaHandle } from "./BangComma";
import { animate, stagger, useReducedMotion } from "motion/react";
import { HERO_INTRO, HOUSE } from "@/lib/design";

/**
 * The hero sentence arriving. See HERO_INTRO for the shape of it.
 *
 * The sentence is laid out in full from the first frame, with every word
 * invisible, so nothing reflows while it plays: "Hey" is measured against
 * the centre of the line it ends up on and starts from there, and slides to
 * its seat as the other words come in beside it. The exclamation point is
 * absolutely positioned over the comma's slot, in the same face and on the
 * same baseline, so it is the comma's height and place before it collapses
 * into it.
 *
 * `onDone` fires when the deck should start dealing — a little before the
 * last word is fully in, so the two overlap at the tail.
 */
export default function HeroIntro({
  play,
  hey,
  words,
  onDone,
  scale,
}: {
  /** False skips straight to the resting sentence. */
  play: boolean;
  hey: string;
  /** The rest of the sentence, split into words. Nodes allowed, for the
   *  hover word. */
  words: ReactNode[];
  onDone: () => void;
  /** The type scale, so the authored travel distances follow the stage. */
  scale: number;
}) {
  const root = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion() ?? false;
  const done = useRef(onDone);
  done.current = onDone;

  const run = play && !reduced;

  const mark = useRef<BangCommaHandle>(null);

  useEffect(() => {
    const el = root.current;
    const m = mark.current;
    if (!el || !m) return;
    const lineEl = el.querySelector<HTMLElement>("[data-line]")!;
    const heyEl = el.querySelector<HTMLElement>("[data-hey]")!;
    const rest = Array.from(el.querySelectorAll<HTMLElement>("[data-word]"));

    if (!run) {
      /* Resting state, at once. */
      for (const w of [lineEl, heyEl, ...rest]) {
        w.style.opacity = "1";
        w.style.transform = "none";
      }
      done.current();
      return;
    }

    const I = HERO_INTRO;
    const k = scale;
    const spring = I.spring;

    /* Where "Hey" would sit if it were alone and centred on its line. The
     * whole line is carried by that amount, so everything on it moves with
     * "Hey" as it gives the centre up. */
    const line = el.getBoundingClientRect();
    const seat = heyEl.getBoundingClientRect();
    const centred = line.left + line.width / 2 - (seat.left + seat.width / 2);
    lineEl.style.transform = `translateX(${centred}px)`;

    const tBang = I.lead + I.bang.at;
    const tLand = tBang + m.landsAt;
    const tRest = tLand + I.rest.after;
    const tRestEnd =
      tRest + I.rest.stagger * Math.max(0, rest.length - 1) + spring.visualDuration;
    const tDeal = Math.max(tRest, tRestEnd - I.deal.lead);

    const ctrl = animate([
      /* "Hey", arriving from the right, on the spring. */
      [heyEl, { opacity: [0, 1] }, { duration: I.hey.fade, ease: "easeOut", at: I.lead }],
      [heyEl, { x: [I.hey.travel * k, 0] }, { ...spring, at: I.lead }],
      /* The line, and "Hey" with it, gives up the centre as the rest comes. */
      [lineEl, { x: 0 }, { ...spring, at: tRest - I.rest.lead }],
      /* The rest of the sentence, a word at a time, each on the same spring
       * inside the line that is carrying it. */
      [
        rest,
        { opacity: [0, 1] },
        { duration: I.rest.fade, ease: "easeOut", delay: stagger(I.rest.stagger), at: tRest },
      ],
      [
        rest,
        { x: [I.rest.travel * k, 0] },
        { ...spring, delay: stagger(I.rest.stagger), at: tRest },
      ],
    ]);

    const markTimer = setTimeout(() => void m.play(), tBang * 1000);
    const dealTimer = setTimeout(() => done.current(), tDeal * 1000);
    return () => {
      clearTimeout(markTimer);
      clearTimeout(dealTimer);
      ctrl.stop();
    };
    // Plays once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  const hidden = run ? { opacity: 0 } : undefined;

  return (
    <span ref={root} style={{ display: "inline" }}>
      <span data-line style={{ display: "inline-block" }}>
      <span
        data-hey
        style={{
          display: "inline-block",
          position: "relative",
          ...hidden,
        }}
      >
        {hey}
        {/* The comma the sentence reads with; drawn by the mark beside it. */}
        <span style={{ position: "absolute", opacity: 0 }}>,</span>
        <BangComma ref={mark} armed={run} />
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
    </span>
  );
}
