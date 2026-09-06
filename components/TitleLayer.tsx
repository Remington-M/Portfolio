"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useStage, type TitleSlot } from "./media/stage";
import { projects, titleLines } from "@/lib/projects";
import { SPRING, TYPE } from "@/lib/design";

/**
 * The project title, travelling between the ledger and the headline.
 *
 * The same problem the media layer solves for the card, and solved the same
 * way: this mounts once in the root layout and never unmounts, so a route
 * change swaps the page underneath it while the words stay put. Two components
 * on two routes could not hand an element to each other; a third that outlives
 * both of them can.
 *
 * It is a FLIP rather than computed geometry. The headline's box could be
 * derived — it is authored in `CASE.intro` — but the ledger's cannot without
 * moving the whole ledger's layout into `lib/geometry.ts`, and a list of rows
 * whose height depends on the text in them is exactly the thing the browser is
 * better at than we are. So both pages register their element and this measures
 * them. Measuring happens twice per navigation, not per frame.
 */
export default function TitleLayer() {
  const { mode, selected, transitionKey, titleAnchors, setTitleFlying, stage } =
    useStage();
  const reduced = useReducedMotion() ?? false;

  /** The box we are coming from, and the one we are going to. */
  const [flight, setFlight] = useState<{
    text: readonly string[];
    from: Box;
    to: Box;
    key: number;
  } | null>(null);

  /** Which slot was showing the title before this route change. */
  const cameFrom = useRef<TitleSlot | null>(null);
  /** The last project the route named, which outlives the route naming it. */
  const lastProject = useRef(-1);

  useEffect(() => {
    const slot: TitleSlot = mode === "case" ? "headline" : "ledger";
    const previous = cameFrom.current;
    cameFrom.current = slot;

    /**
     * Which title to carry, including on the way back.
     *
     * `selected` is the project the ROUTE names, so it is -1 the moment you
     * leave for the home page — and the return trip is exactly when the layer
     * still needs to know which words it is carrying. Remembering the last one
     * named covers both directions: going out it is the project just opened,
     * coming back it is the project just left.
     */
    const index = selected.get();
    if (index >= 0) lastProject.current = index;
    const project =
      lastProject.current >= 0 ? projects[lastProject.current] : null;

    // Nothing to carry: the first paint of a session, a route with no project,
    // or a change that did not move the title between slots.
    if (!project || !previous || previous === slot || reduced) return;

    /**
     * Measured here and not in a frame callback.
     *
     * The arriving page has already registered its element and been laid out
     * by the time this runs — ref callbacks fire during commit, effects after
     * it — so the destination is readable immediately, and waiting a frame
     * would only add one of latency to the start of the flight.
     *
     * The departing element is gone by now, which is why the FROM box is the
     * one cached while it was on screen rather than read here.
     */
    const from = boxes.current[previous];
    const to = measure(titleAnchors.current[slot]);
    if (!from || !to) return;
    setFlight({ text: titleLines(project), from, to, key: transitionKey });
    setTitleFlying(true);
    /**
     * Keyed on the route change alone.
     *
     * `mode` is derived from the pathname during render, so it flips a render
     * BEFORE `transitionKey` — and a render before `selected` is set, since
     * that happens in the provider's effect. Depending on both meant this ran
     * twice: once with no project yet, and again once `cameFrom` had already
     * been advanced by the first run, so neither pass ever saw a real
     * departure. By the time the key changes, everything else has settled.
     */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transitionKey]);

  /**
   * Where each slot's title is, kept current while that page is up.
   *
   * One entry per slot rather than a single "last box". A single one was
   * overwritten by the arriving page before the departing box could be read —
   * `mode` flips a render early, so the headline had already been measured
   * over the top of the ledger's box by the time the flight was worked out.
   * Keyed by slot, tracking one cannot destroy the other.
   *
   * Polled rather than measured once: the active ledger row grows when it
   * becomes active, which moves every row under it, and the row that matters
   * is whichever one is currently at the front of the deck.
   */
  const boxes = useRef<Partial<Record<TitleSlot, Box>>>({});
  useEffect(() => {
    if (flight) return;
    const slot: TitleSlot = mode === "case" ? "headline" : "ledger";
    const tick = () => {
      const b = measure(titleAnchors.current[slot]);
      if (b) boxes.current[slot] = b;
    };
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [mode, flight, titleAnchors, stage.w, stage.h]);

  if (!flight) return null;

  return (
    <motion.div
      key={flight.key}
      aria-hidden
      initial={{
        x: flight.from.x,
        y: flight.from.y,
        fontSize: flight.from.size,
        letterSpacing: flight.from.track,
      }}
      animate={{
        x: flight.to.x,
        y: flight.to.y,
        fontSize: flight.to.size,
        letterSpacing: flight.to.track,
      }}
      transition={{
        type: "spring",
        stiffness: SPRING.handoff.stiffness,
        damping: SPRING.handoff.damping,
        mass: SPRING.handoff.mass,
      }}
      onAnimationComplete={() => {
        setFlight(null);
        setTitleFlying(false);
      }}
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        margin: 0,
        zIndex: 80,
        transformOrigin: "0 0",
        pointerEvents: "none",
        whiteSpace: "pre",
        color: "var(--ink)",
        fontFamily: "var(--font-sans)",
        fontWeight: 400,
        // The two ends differ in leading as well as size; the travelling copy
        // takes the destination's, since that is where it comes to rest.
        lineHeight: TYPE.display.line,
      }}
    >
      {flight.text.map((line, i) => (
        <span key={i} style={{ display: "block" }}>
          {line}
        </span>
      ))}
    </motion.div>
  );
}

type Box = { x: number; y: number; size: number; track: string };

function measure(el: HTMLElement | null): Box | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  const cs = getComputedStyle(el);
  return {
    x: r.left,
    y: r.top,
    size: parseFloat(cs.fontSize),
    track: cs.letterSpacing === "normal" ? "0px" : cs.letterSpacing,
  };
}
