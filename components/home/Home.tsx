"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  motion,
  useMotionValueEvent,
  useTransform,
  useReducedMotion,
} from "motion/react";
import { useStage } from "@/components/media/stage";
import Header from "@/components/Header";
import Ledger from "./Ledger";
import Ticks from "@/components/Ticks";
import { projects } from "@/lib/projects";
import {
  DECK,
  DECK_MOTION,
  HERO_EXIT,
  HOME_IDLE,
  TYPE,
  type as typeStyle,
} from "@/lib/design";
import { clamp01 } from "@/lib/spring";
import { frontIndex, stageY } from "@/lib/geometry";

/**
 * The home screen.
 *
 * Nothing on this page actually moves down the document. A tall scroll
 * container drives a sticky stage, and every position is a function of its
 * scrollTop — which is what makes the deck shuffle continuous and exactly
 * reversible when you scrub back up.
 *
 * The cards themselves are not here. They live in the persistent media layer so
 * they can survive the navigation into a project page.
 */
export default function Home() {
  const {
    p,
    pTarget,
    pi,
    stage,
    mobile,
    restoreDeck,
    rememberDeck,
    deckDriven,
    registerDeckScroll,
    rebaseDeck,
  } = useStage();
  const reduced = useReducedMotion() ?? false;
  const scrollRef = useRef<HTMLDivElement>(null);

  /**
   * One continuous scroll, inferred from the gaps between its events, and how
   * many cards it has turned through so far.
   */
  const lastScrollAt = useRef(0);
  const turnedThisScroll = useRef(0);
  const [front, setFront] = useState(() => frontIndex(p.get(), projects.length));

  const cfg = mobile ? DECK.mobile : DECK.desktop;
  const n = projects.length;

  /** Scroll distance for one full turn of the deck. */
  const lap = n * cfg.step;

  /**
   * Two laps of scroll, not one.
   *
   * The deck runs for ever, and it does that by quietly rewinding: once a full
   * turn has been scrolled the scroller is pulled back a lap and the animation
   * is rewound with it. Because depth is measured around a ring, the position
   * before and after that rewind paint identically, so nothing moves. Holding
   * two laps of room means there is always a lap of scroll left ahead of the
   * rewind point, so the wheel never runs into the end of the page.
   */
  const scrollHeight = cfg.intro + cfg.hold + 2 * lap + stage.h;

  /**
   * Scroll position at which project `value` sits at rest.
   *
   * The first project rests in the MIDDLE of the dwell rather than at its end,
   * so there is scroll room on both sides of it. Landing it at the end would
   * keep the original problem: the card would arrive and start shuffling away
   * on the very next pixel, which is what made it feel skipped.
   */
  const deckTop = useCallback(
    (value: number) =>
      value <= 0
        ? cfg.intro + cfg.hold / 2
        : cfg.intro + cfg.hold + value * cfg.step,
    [cfg.intro, cfg.hold, cfg.step],
  );

  /**
   * Whether the deck is still dealing itself on the landing screen.
   *
   * A ref as well as state: `onScroll` runs on every scroll event and has to
   * read this without being rebuilt, while the interval below needs a
   * dependency it can be torn down by.
   */
  const [idle, setIdle] = useState(true);
  const idling = useRef(true);
  /**
   * Set when the deal has ended but the deck has not yet been put back on the
   * first project — it waits for the intro to be under way, so the turn is
   * still running when the stack arrives.
   */
  const owed = useRef(false);

  /**
   * Put the deck back on the first project, going the short way round.
   *
   * The scroller is still at the top when this runs, and at the top `raw` is
   * 0 — the scroll position says "first card" no matter how many the timer has
   * dealt. So this has to land on exactly 0, or `onScroll` will spend the next
   * few gestures walking it back there two cards at a time.
   *
   * Going forwards is a rebase rather than a bigger target. `pTarget` has to
   * end at 0 to agree with the scroller, so the distance is taken out of `p`
   * instead: a lap off the animation is invisible — a position and that
   * position plus a lap paint identically — and leaves the spring travelling
   * up to 0 from below, which is the deck turning the way it has been turning
   * rather than rewinding through the cards it just dealt.
   */
  const dealBackToFirst = useCallback(() => {
    const k = (((pTarget.get() % n) + n) % n);
    if (k === 0) return;
    if (k > DECK_MOTION.reverseMax) rebaseDeck(1);
    pTarget.set(0);
  }, [pTarget, n, rebaseDeck]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    // A gesture owns the deck while it runs. Writing `p` from scroll here would
    // fight the drag and snap the card back on the next scroll event.
    if (deckDriven.current) return;

    const top = el.scrollTop;
    pi.set(Math.min(1, top / cfg.intro));

    /**
     * Back at the very top: the landing screen again, so the deck deals again.
     *
     * Whatever card browsing left at the front is where the deal picks up —
     * at the top there is no ledger row lit and no shot showing, so the deck
     * has no position anyone is relying on, and scrolling back down puts it
     * on the first project the same way it did the first time.
     */
    if (!idling.current && top <= 0) {
      idling.current = true;
      owed.current = false;
      setIdle(true);
    }

    /**
     * Leaving the top ends the deal, and owes the deck a turn back to the
     * first project — so the stack you scroll down to is the one the ledger
     * starts on.
     */
    if (idling.current && top > 0) {
      idling.current = false;
      setIdle(false);
      owed.current = true;
    }

    /**
     * While a turn is owed, this handler does nothing else.
     *
     * Everything below picks a card by comparing the scroll position with the
     * deck's — and while the deal has been running those two disagree by
     * however many cards the timer turned, which the scroller knows nothing
     * about. Left to run it read that gap as travel: the per-gesture limit
     * tripped, and the pin that enforces it wrote the scroller to the card the
     * deck stopped at, throwing the page from the top of the intro to deep
     * inside the deck. There is nothing here worth stepping anyway — the whole
     * intro maps to the first card.
     *
     * Paying it waits for the intro to be under way rather than firing on the
     * first pixel, so the shuffle is still turning as the stack rises.
     */
    if (owed.current) {
      if (top < cfg.intro * HOME_IDLE.settleAt) return;
      owed.current = false;
      dealBackToFirst();
      return;
    }

    /**
     * A gesture is a run of scroll events with no real gap in it — one flick
     * and its coasting. A quiet moment starts a fresh one, and with it a fresh
     * allowance.
     */
    const now = performance.now();
    if (now - lastScrollAt.current > DECK_MOTION.gestureGap)
      turnedThisScroll.current = 0;
    lastScrollAt.current = now;

    /**
     * Scroll picks the card, it does not scrub the shuffle. The raw position
     * is only consulted to decide whether we have gone far enough into the
     * next card to commit to it; the move itself is then played out by a
     * spring in the media layer. The threshold is measured against the card we
     * are committed to rather than by rounding, so the deck does not flip back
     * and forth on the boundary, and the loop covers a fast scroll crossing
     * several cards inside one event.
     */
    const raw = Math.max(0, (top - cfg.intro - cfg.hold) / cfg.step);
    const before = pTarget.get();
    let committed = before;
    while (raw >= committed + DECK_MOTION.commit && committed < n) committed += 1;
    while (raw <= committed - DECK_MOTION.commit && committed > 0) committed -= 1;

    /**
     * One scroll turns through a limited number of cards. Without this a hard
     * flick carries the deck round the whole list and out the other side, and
     * it reads as a slot machine rather than as a deck being looked through.
     */
    const wanted = Math.abs(committed - before);
    if (wanted > 0) {
      const left = Math.max(
        0,
        DECK_MOTION.maxPerGesture - turnedThisScroll.current,
      );
      if (wanted > left)
        committed = before + Math.sign(committed - before) * left;
      turnedThisScroll.current += Math.abs(committed - before);
    }

    /**
     * A full turn behind us: rewind a lap so scrolling can carry on for ever.
     *
     * The committed card is rewound along with the scroller and the animation.
     * Rewinding only the other two used to leave this one a whole lap ahead,
     * and the next scroll event then read that gap as six cards of travel in
     * the opposite direction — which both jerked the deck and spent an
     * allowance that had not been used, letting a gesture run past its limit.
     */
    if (committed >= n) {
      committed -= n;
      el.scrollTop -= lap;
      rebaseDeck(1);
    }

    /**
     * Out of allowance: hold the scroller on the card the deck stopped at,
     * which absorbs the rest of the momentum. Letting it coast on would leave
     * the scroll position pointing at a card the deck never reached.
     */
    if (turnedThisScroll.current >= DECK_MOTION.maxPerGesture) {
      const pin = deckTop(committed);
      if (Math.abs(el.scrollTop - pin) > 1) el.scrollTop = pin;
    }

    pTarget.set(committed);
  }, [
    pTarget,
    pi,
    n,
    lap,
    cfg.intro,
    cfg.hold,
    cfg.step,
    deckDriven,
    rebaseDeck,
    deckTop,
    dealBackToFirst,
  ]);

  /**
   * Let a fling put the scroller where the card landed.
   *
   * Written directly rather than through `scrollTo`, and with the scroll
   * handler already suppressed, so this repositions the scroller silently
   * instead of kicking off a second animation that would fight the spring.
   */
  useEffect(() => {
    registerDeckScroll((value: number) => {
      const el = scrollRef.current;
      if (!el) return;
      /**
       * A deck position can be anywhere on the ring; a scroll position cannot.
       *
       * Whole laps are moved off the value and out of the animation together,
       * which is invisible — a position and that position plus a lap paint
       * identically — and leaves a number the scroller can actually hold.
       * Going forwards this was already handled after the fact, by the lap
       * rewind in `onScroll`. Going backwards there was nothing: the scroller
       * was simply written a negative card, which resolves to the hold before
       * the first one, and the deck stuck there.
       */
      const laps = Math.floor(value / n);
      if (laps !== 0) {
        rebaseDeck(laps);
        value -= laps * n;
        pTarget.set(value);
      }
      el.scrollTop = deckTop(value);
    });
    return () => registerDeckScroll(null);
  }, [registerDeckScroll, deckTop, n, rebaseDeck, pTarget]);

  useMotionValueEvent(p, "change", (v) => {
    // Remember on every change rather than on click, so leaving by the browser
    // back button restores the deck just as well as the return links do.
    rememberDeck(v);
    const next = frontIndex(v, n);
    setFront((prev) => (prev === next ? prev : next));
  });

  // Returning from a project page restores the deck rather than resetting it
  // to the first card.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || stage.h === 0) return;
    const remembered = restoreDeck();
    if (remembered !== null) {
      pTarget.set(Math.round(remembered));
      // Arrived back at the deck rather than at the landing screen: there is
      // no hero to deal under, and the remembered card is the whole point.
      // Scrolling all the way back to the top starts it dealing again.
      idling.current = false;
      setIdle(false);
      owed.current = false;
    }
    el.scrollTop = remembered === null ? 0 : deckTop(remembered);
    onScroll();
    // Only on mount and when the stage is first measured.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage.h === 0]);

  /**
   * Deal a card every few seconds while the landing screen is still up.
   *
   * Advancing `pTarget` is the whole implementation: the media layer already
   * springs the deck to whatever that says and plays the shuffle to get there,
   * so this is the scroll wheel's own path with a timer on the end of it
   * rather than a second animation that would have to be kept in step.
   *
   * The position is kept inside one lap as it goes. Left to run, `pTarget`
   * would climb for as long as the page is open — it paints identically,
   * since depth is measured around a ring, but it would hand the first scroll
   * a number the scroller has no room for. Taking the lap off both the target
   * and the animation at once is invisible.
   */
  useEffect(() => {
    if (!idle || reduced) return;
    const id = setInterval(() => {
      // Nothing dealt into a hidden tab: the timer would bank a dozen turns
      // and pay them out in one riffle the moment it came back.
      if (document.visibilityState !== "visible") return;
      // A hand on the deck owns it.
      if (deckDriven.current) return;
      const next = pTarget.get() + 1;
      if (next >= n) {
        rebaseDeck(1);
        pTarget.set(next - n);
      } else {
        pTarget.set(next);
      }
    }, HOME_IDLE.every);
    return () => clearInterval(id);
  }, [idle, reduced, n, pTarget, rebaseDeck, deckDriven]);

  const jumpTo = useCallback(
    (i: number) => {
      const el = scrollRef.current;
      if (!el) return;
      /**
       * The deck is a ring, so there are two ways to reach any project and
       * this picks the shorter one.
       *
       * A short hop back just reverses — for a card or two that reads as
       * undoing the last move. Anything further carries on FORWARDS instead
       * and wraps around, which is the motion the deck is built around: cards
       * leaving the front and slotting in behind. Running that in reverse
       * three or four times over is what made a jump back across the deck look
       * busy.
       */
      const current = Math.round(pTarget.get());
      const back = (((current - i) % n) + n) % n;
      const forward = (((i - current) % n) + n) % n;
      if (back === 0) return;

      if (back <= DECK_MOTION.reverseMax) {
        const to = current - back;
        if (to >= 0) {
          el.scrollTo({
            top: deckTop(to),
            behavior: reduced ? "auto" : "smooth",
          });
          return;
        }
        /**
         * Reversing off the bottom of the scroller.
         *
         * The deck is a ring and the scroller is a line, and the line stops at
         * the first card — so a single step back from it has nowhere to scroll
         * to. Aiming at the LAST card's scroll position instead is a five-card
         * journey forwards, which is what this used to do: ask for one step
         * back from the top of the stack and watch the whole deck riffle past
         * in the wrong direction.
         *
         * The layer drives it, exactly as it does for a long way round, and
         * takes the deck to −1. That paints as the last card coming to the
         * front, because depth is measured around the ring and −1 and n−1 are
         * the same place. The commit puts the scroller back in range.
         */
        deckDriven.current = true;
        pTarget.set(to);
        return;
      }

      /**
       * Going the long way round means the deck position runs past the end of
       * its range, so the scroller cannot carry it — the media layer drives it
       * and rebases once it arrives. A position and that position plus a full
       * lap are identical on screen, since depth is measured around the ring,
       * so the rebase is invisible.
       */
      deckDriven.current = true;
      pTarget.set(current + forward);
    },
    [deckTop, reduced, pTarget, deckDriven, n],
  );

  /**
   * Left and right step the deck.
   *
   * The project page has walked its shots with the arrows all along; the deck
   * is the same kind of sequence and had nothing but the wheel and the ledger.
   * Horizontal, because that is the axis the cards travel on — a card leaves to
   * the side and slots in behind, whatever the scroller underneath is doing.
   *
   * Up and down are left alone. They belong to the scroller, and the deck's
   * whole design is that scroll position IS deck position; taking them over
   * would put two different meanings on one gesture.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      // Leave typing and activating alone.
      if (
        target &&
        (target.isContentEditable ||
          /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
      )
        return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;

      const el = scrollRef.current;
      if (!el) return;
      e.preventDefault();

      /**
       * While the hero is still on screen the deck has not arrived yet, so the
       * first press brings it in rather than skipping a card nobody has seen.
       */
      if (pi.get() < 0.999) {
        el.scrollTo({
          top: deckTop(Math.round(pTarget.get())),
          behavior: reduced ? "auto" : "smooth",
        });
        return;
      }

      const step = e.key === "ArrowRight" ? 1 : -1;
      const current = Math.round(pTarget.get());
      // `jumpTo` owns the ring: one step back reverses, one step forward
      // carries on the way the deck is built to move.
      jumpTo((((current + step) % n) + n) % n);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [jumpTo, deckTop, pi, pTarget, reduced, n]);

  // Hero settles back as the deck arrives. Driven straight off the intro
  // progress, so no re-render happens while scrolling.
  const heroOpacity = useTransform(pi, (v) =>
    Math.max(0, 1 - v * HERO_EXIT.fade),
  );
  /**
   * On the fade's clock, not the intro's, so the two finish together and read
   * as one gesture rather than as a scale that carries on invisibly.
   */
  const heroScale = useTransform(pi, (v) =>
    reduced ? 1 : 1 - (1 - HERO_EXIT.scale) * clamp01(v * HERO_EXIT.fade),
  );
  const chromeOpacity = useTransform(pi, (v) => clamp01((v - 0.45) * 2.2));

  const s = stage.s;
  const ts = stage.ts;

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="no-scrollbar"
      style={{
        position: "fixed",
        inset: 0,
        overflowY: "auto",
        overflowX: "hidden",
        // `proximity` rather than `mandatory`: the deck is a scrubber, and
        // mandatory snapping fights a scroll that is mid-shuffle.
        scrollSnapType: "y proximity",
        WebkitOverflowScrolling: "touch",
      }}
    >
      <div style={{ position: "relative", height: scrollHeight }}>
        <div
          style={{
            position: "sticky",
            top: 0,
            height: "100svh",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "relative",
              width: stage.w || "100%",
              height: "100%",
              margin: "0 auto",
            }}
          >
            <Header variant="home" />

            <motion.div
              style={{
                position: "absolute",
                left: mobile ? 24 : 0,
                right: mobile ? 24 : 0,
                top: stageY(stage, mobile ? 132 : 256),
                zIndex: 52,
                display: "flex",
                justifyContent: "center",
                opacity: heroOpacity,
                scale: heroScale,
                pointerEvents: "none",
              }}
            >
              <h1
                style={{
                  margin: 0,
                  maxWidth: mobile ? "none" : 760 * ts,
                  textAlign: "center",
                  /**
                   * One role either way. The desktop line-height was written
                   * twice — a unitless 1.18 and a `50.81px` override sitting
                   * next to it — and the override is gone.
                   */
                  ...typeStyle(mobile ? TYPE.heroMobile : TYPE.hero, ts),
                  color: "var(--ink)",
                  textWrap: "pretty",
                }}
              >
                Hey, I&rsquo;m Remington and I make software come to life with
                motion.
              </h1>
            </motion.div>

            {mobile ? (
              <motion.div
                style={{
                  position: "absolute",
                  left: 24,
                  right: 24,
                  bottom: stage.top + 36 * s,
                  zIndex: 56,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 9,
                  textAlign: "center",
                  opacity: chromeOpacity,
                }}
              >
                <div
                  style={{
                    ...typeStyle(TYPE.titleMMobile, ts),
                    color: "var(--ink)",
                  }}
                >
                  {projects[front].title}
                </div>
                <div
                  style={{
                    ...typeStyle(TYPE.numeral, ts),
                    color: "var(--ink-3)",
                  }}
                >
                  {projects[front].year}
                </div>
                <div style={{ paddingTop: 6 }}>
                  <Ticks
                    count={n}
                    active={front}
                    onJump={jumpTo}
                    labels={(i) => `Go to ${projects[i].title}`}
                  />
                </div>
              </motion.div>
            ) : (
              <motion.div
                style={{
                  position: "absolute",
                  // Tucked further out than the authored 120 so the ledger and
                  // the deck stop crowding each other.
                  left: 76 * ts,
                  top: "50%",
                  y: "-50%",
                  zIndex: 56,
                  opacity: chromeOpacity,
                }}
              >
                <Ledger front={front} onJump={jumpTo} />
              </motion.div>
            )}
          </div>
        </div>

        {/*
          Snap markers, placed at exact offsets: one for the hero, then one per
          project. Deliberately not flex children — as flex items they get
          shrunk to fit the wrapper, which silently moves every snap point.
        */}
        <div aria-hidden style={{ pointerEvents: "none" }}>
          {Array.from({ length: 2 * n + 1 }, (_, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                left: 0,
                width: 1,
                height: 1,
                top: i === 0 ? 0 : deckTop(i - 1),
                scrollSnapAlign: "start",
              }}
            />
          ))}
        </div>
      </div>

      {/*
        The deck is the visual navigation, but only the front card is clickable.
        These links give crawlers and assistive technology direct access to
        every project without altering the design.
      */}
      <nav className="sr-only" aria-label="All projects">
        <ul>
          {projects.map((project) => (
            <li key={project.slug}>
              <Link href={`/work/${project.slug}`}>
                {project.title} — {project.year}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
