"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  useReducedMotion,
} from "motion/react";
import { useStage } from "@/components/media/stage";
import Header from "@/components/Header";
import Ledger from "./Ledger";
import HeroType from "./HeroType";
import HeroTunePanel from "./HeroTunePanel";
import DeckTouch from "./DeckTouch";
import { heroRead, heroSpring, heroTune, onHeroReplay } from "@/lib/heroTuning";
import Ticks from "@/components/Ticks";
import { projects } from "@/lib/projects";
import {
  DECK,
  DECK_MOTION,
  CHROME_IN,
  HERO_EXIT,
  HERO_SEAT,
  HERO_TYPE,
  HOME_IDLE,
  LEDGER_IN,
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
    deal,
  } = useStage();
  const reduced = useReducedMotion() ?? false;
  const scrollRef = useRef<HTMLDivElement>(null);

  /**
   * The landing sequence plays on a fresh arrival only. Coming back from a
   * project there is a deck to restore and no hero moment to stage.
   */
  const [playIntro] = useState(() => restoreDeck() === null && deal.get() < 1);
  /** Back from a project: the deck is restored, and the ledger fades in. */
  const [returned] = useState(() => restoreDeck() !== null);

  /**
   * Deal the cards in once the sentence has arrived. The layer's own springs
   * carry each card, so this is one eased value they all follow.
   */
  const [dealt, setDealt] = useState(() => deal.get() >= 1);
  const heroBox = useRef<HTMLHeadingElement>(null);
  /**
   * The sentence is typed in the middle of the screen and rises to its seat
   * as the cards deal in. This is that lift, in px, on top of the seat.
   */
  const heroY = useMotionValue(0);
  /** Bumped by a replay from the tuning panel; remounts the sentence. */
  const [introKey, setIntroKey] = useState(0);
  const dealIn = useCallback(() => {
    if (deal.get() >= 1) {
      setDealt(true);
      return;
    }
    if (reduced) {
      deal.set(1);
      setDealt(true);
      return;
    }
    animate(deal, 1, {
      ...heroSpring(heroTune.dealStiffness, heroTune.dealRatio, heroTune.dealMass),
      onComplete: () => setDealt(true),
    });
    // The sentence sets off this long after the cards.
    animate(heroY, 0, {
      ...heroSpring(heroTune.riseStiffness, heroTune.riseRatio, heroTune.riseMass),
      delay: heroTune.riseDelay,
    });
  }, [deal, reduced, heroY]);

  /**
   * Put the sentence in the middle of the screen before it starts typing.
   * Measured once the stage is known; the text is clipped to nothing until
   * the sequence starts, so nothing is seen moving into place.
   */
  useEffect(() => {
    if (!(playIntro || introKey > 0) || reduced || stage.h === 0) return;
    const el = heroBox.current;
    if (!el) return;
    const seat = stageY(stage, mobile ? HERO_SEAT.mobile : HERO_SEAT.desktop);
    heroY.set(stage.h / 2 - seat - el.offsetHeight / 2);
    // On mount, and again on replay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [introKey, stage.h]);

  /**
   * One continuous scroll, inferred from the gaps between its events, and how
   * many cards it has turned through so far.
   */
  const lastScrollAt = useRef(0);
  /**
   * Where a programmatic smooth scroll — a ledger jump, an arrow key — is
   * heading, or null. Such a scroll is not a gesture: it may cross two
   * cards, and the one-card-per-gesture rule below must not pin it after
   * the first. Cleared when the scroller arrives.
   */
  const jumpTarget = useRef<number | null>(null);
  /** When the deck was first seen at rest while still flagged as driven. */
  const drivenRestSince = useRef(0);
  /** Size of the previous scroll event, for telling a push from coasting. */
  const lastDelta = useRef(0);
  const turnedThisScroll = useRef(0);
  /** Where the scroller sat on the previous event, to find where a gesture began. */
  const lastTop = useRef(0);
  /**
   * Whether the gesture under way began above the first project — on the hero
   * or anywhere in the intro. Such a gesture ends on the first project however
   * hard it was thrown; see the cap in `onScroll`.
   */
  const fromHero = useRef(false);
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
  /** Pending settle of a scroll that stopped inside the intro. */
  const introSettle = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Where the scroller was last written by a throw, or null.
   *
   * The write fires a scroll event of its own a frame later, by which time
   * the deck has been released, and the handler took that event for a new
   * gesture. Thrown just after arriving from the hero — the settle still in
   * flight, the last position still inside the intro — it counted as a
   * gesture FROM the hero, and that branch pins the deck to the first card:
   * the card went round to the back and came straight back to the front.
   * The event is absorbed instead; it is the deck telling the scroller
   * where it is, not the other way round.
   */
  const commitTop = useRef<number | null>(null);
  /** When that write was made, so it cannot be insisted on for ever. */
  const commitAt = useRef(0);
  /**
   * The hand is back on the page: whatever the scroller reports from here
   * is a real scroll. The committed position is written one last time —
   * nothing is animating now, so the write takes — and the hold ends.
   */
  const releaseCommit = useCallback(() => {
    const el = scrollRef.current;
    if (!el || commitTop.current === null) return;
    el.scrollTop = commitTop.current;
    lastTop.current = commitTop.current;
    commitTop.current = null;
  }, []);

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

  /**
   * The tuning panel can ask for the sequence again: the cards go back
   * under the stage, the deck turns back to the opening card — the idle
   * deal may have turned it since — and the sentence remounts and plays
   * from the top, with the idle deal starting over once it has landed.
   */
  useEffect(
    () =>
      onHeroReplay(() => {
        deal.set(0);
        setDealt(false);
        dealBackToFirst();
        idling.current = true;
        setIdle(true);
        owed.current = false;
        setIntroKey((k) => k + 1);
      }),
    [deal, dealBackToFirst],
  );

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const top = el.scrollTop;
    /**
     * The intro is read from the scroll position on EVERY event, before
     * anything can return early. It used to sit below the gesture check, so
     * a scroll processed while the layer was driving the deck left it where
     * the last ordinary event had put it — a fraction short of 1 — and the
     * deck sat stranded a little down and to the left of its seat, slightly
     * too big, until the next plain scroll. Nothing about a gesture changes
     * where the intro is: it is a function of the scroller alone.
     */
    pi.set(Math.min(1, top / cfg.intro));

    if (commitTop.current !== null) {
      if (Math.abs(top - commitTop.current) < 2) {
        commitTop.current = null;
        if (introSettle.current) clearTimeout(introSettle.current);
        introSettle.current = null;
        // The next real gesture starts from here, and from the deck.
        lastTop.current = top;
        lastScrollAt.current = performance.now();
        lastDelta.current = 0;
        turnedThisScroll.current = 0;
        fromHero.current = false;
        return;
      }
      /**
       * Somewhere else. On a phone a light throw leaves the scroller mid
       * snap-back from a little vertical drift, and iOS lets that animation
       * run on over the write — the scroller lands on the card BEFORE the
       * throw, and reading that position would turn the deck back and bring
       * the thrown card round to the front again. The write is insisted on
       * until the scroller reports it, for a short while; nothing is read
       * from these positions, they are the browser's, not the hand's.
       */
      if (performance.now() - commitAt.current < DECK_MOTION.commitHold) {
        el.scrollTop = commitTop.current;
        return;
      }
      commitTop.current = null;
    }

    /**
     * The intro is not a place to stop.
     *
     * A wheel flick carries through it, but a trackpad gesture can end
     * anywhere, and a scroller resting half way through the intro draws the
     * stack half way along its travel — down and to the left of its seat and
     * too big — and holds it there, which read as the deck stuck in a broken
     * state. Every scroll inside the intro re-arms a short timer; when the
     * scrolling stops with the page still inside, it is finished for the
     * user: on to the first project past `settleAt`, back to the top before
     * it. A smooth scroll fires scroll events of its own, and those re-arm
     * the timer too, so it never fires against a scroll still in motion.
     */
    if (introSettle.current) clearTimeout(introSettle.current);
    introSettle.current = null;
    if (top > 0 && top < deckTop(0) - 1 && !deckDriven.current) {
      introSettle.current = setTimeout(() => {
        introSettle.current = null;
        const el2 = scrollRef.current;
        if (!el2 || deckDriven.current) return;
        const t = el2.scrollTop;
        if (t <= 0 || t >= deckTop(0) - 1) return;
        el2.scrollTo({
          top: t >= cfg.intro * HOME_IDLE.settleAt ? deckTop(0) : 0,
          behavior: reduced ? "auto" : "smooth",
        });
      }, DECK_MOTION.gestureGap);
    }

    // A gesture owns the deck while it runs. Writing `p` from scroll here would
    // fight the drag and snap the card back on the next scroll event.
    if (deckDriven.current) {
      /**
       * Unless it has plainly finished. The layer releases the deck when a
       * thrown or jumped card arrives; should that ever be missed, every
       * scroll from then on would be swallowed here with no way out. A deck
       * at rest on its target for a beat is not being driven by anything.
       */
      const atRest = Math.abs(p.get() - pTarget.get()) < 0.02;
      if (!atRest) drivenRestSince.current = 0;
      else if (drivenRestSince.current === 0) drivenRestSince.current = performance.now();
      else if (performance.now() - drivenRestSince.current > 400) {
        deckDriven.current = false;
        drivenRestSince.current = 0;
      }
      if (deckDriven.current) return;
    }
    drivenRestSince.current = 0;

    /**
     * A gesture is a run of scroll events with no real gap in it — one flick
     * and its coasting. A quiet moment starts a fresh one, and with it a fresh
     * allowance.
     *
     * Timed on EVERY event, here, before anything below can return early. It
     * used to start below the intro's early returns, so a flick thrown from the
     * hero spent its first stretch unseen and arrived at the deck looking like a
     * brand-new gesture with a full allowance — which its momentum then spent,
     * landing two or three projects in.
     *
     * Where the gesture started is read from the PREVIOUS event's position:
     * a hard flick's first event can already be deep in the deck.
     */
    const now = performance.now();
    /**
     * How far this event moved the scroller. While the scroller is pinned
     * each event moves it from the pin, so this is the event's own size
     * either way.
     */
    const delta = Math.abs(top - lastTop.current);
    const landed = Math.abs(p.get() - pTarget.get()) < 0.02;
    const pushed = delta > lastDelta.current * DECK_MOTION.pushRatio;
    if (now - lastScrollAt.current > DECK_MOTION.gestureGap) {
      turnedThisScroll.current = 0;
      fromHero.current = lastTop.current < deckTop(0) - 1;
    } else if (fromHero.current && landed && pushed && top > deckTop(0) - 1) {
      /**
       * Arrived from the hero, landed on the first project, and pushed
       * again: the arrival is over and this is browsing. Without this the
       * arrival flag lasted the whole gesture, and a continuous trackpad
       * scroll never pauses long enough to end one — every event was
       * pinned back to the first card and the deck seemed to ignore the
       * wheel until the hand came off it.
       */
      fromHero.current = false;
      turnedThisScroll.current = 0;
    } else if (
      turnedThisScroll.current >= DECK_MOTION.maxPerGesture &&
      landed &&
      pushed
    ) {
      /**
       * The deck has landed on the card this gesture turned to, and the
       * scrolling is not just coasting — the events are getting BIGGER,
       * which momentum never does; a finger has pushed again. That is the
       * next card being asked for. A continuous trackpad scroll never
       * pauses long enough to count as a new gesture, so without this it
       * only ever turned one card and then went dead against the pin;
       * resetting on landing alone let a flick's coasting take a second
       * card the moment the first had settled.
       */
      turnedThisScroll.current = 0;
    }
    lastDelta.current = delta;
    heroRead.events += 1;
    heroRead.scrollTop = top;
    heroRead.scrollMax = el.scrollHeight - el.clientHeight;
    heroRead.deck = p.get();
    lastScrollAt.current = now;
    lastTop.current = top;

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
      /**
       * The deck is now somewhere worth coming back to. Remembered on every
       * change of position as well, below — but a deck that never turned
       * never changed, and opening its front card straight away then landed
       * the way back on the hero and the fold instead of on the deck.
       */
      rememberDeck(pTarget.get());
      // Scrolling into the deck before it has finished dealing: the cards are
      // wanted now, and their own springs smooth the rest of the way.
      if (deal.get() < 1) deal.set(1);
    }

    /**
     * On the landing screen the deal owns the deck, and this handler does not.
     *
     * Everything below reads a card out of the scroll position, and at the top
     * that position says "the first one" — which overwrote the card the deck
     * opens on the moment the page mounted, and would undo every turn the
     * timer made. There is nothing to read up here anyway: no ledger row is
     * lit and no shot is showing.
     */
    if (idling.current) return;

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
      if (el.scrollTop > deckTop(0) + 1) el.scrollTop = deckTop(0);
      return;
    }

    /**
     * Scrolling down from the hero ends on the first project. Always.
     *
     * However hard the flick, a gesture that began above the first project
     * does not turn a single card: the scroller is held on the first project's
     * rest and the rest of the momentum is absorbed there. Leaving the hero is
     * arriving at the work, and the work starts at the top of the list — a
     * throw that carried past it would skip the one project the ledger opens
     * on. The next gesture, from the first project, moves through the deck as
     * normal.
     */
    if (fromHero.current) {
      if (el.scrollTop > deckTop(0) + 1) el.scrollTop = deckTop(0);
      pTarget.set(0);
      return;
    }

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
    if (jumpTarget.current !== null && Math.abs(top - jumpTarget.current) < 2)
      jumpTarget.current = null;
    const jumping = jumpTarget.current !== null;
    const wanted = Math.abs(committed - before);
    if (wanted > 0 && !jumping) {
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
    heroRead.pinned = !jumping && turnedThisScroll.current >= DECK_MOTION.maxPerGesture;
    if (heroRead.pinned) {
      const pin = deckTop(committed);
      if (Math.abs(el.scrollTop - pin) > 1) el.scrollTop = pin;
    }
    heroRead.raw = raw;
    heroRead.committed = committed;
    heroRead.turned = turnedThisScroll.current;

    pTarget.set(committed);
  }, [
    p,
    pTarget,
    pi,
    deal,
    n,
    lap,
    cfg.intro,
    cfg.hold,
    cfg.step,
    deckDriven,
    rebaseDeck,
    deckTop,
    dealBackToFirst,
    reduced,
  ]);
  useEffect(
    () => () => {
      if (introSettle.current) clearTimeout(introSettle.current);
    },
    [],
  );

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
      const target = deckTop(value);
      // Only a write that moves the scroller fires an event to absorb.
      commitTop.current = Math.abs(el.scrollTop - target) >= 1 ? target : null;
      commitAt.current = performance.now();
      el.scrollTop = target;
      /* Every deck position is past the intro, and a write that does not
       * move the scroller fires no event, so say so here as well. */
      pi.set(1);
    });
    return () => registerDeckScroll(null);
  }, [registerDeckScroll, deckTop, n, rebaseDeck, pTarget, pi]);

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
    /**
     * The scroll handler infers a fresh gesture on its first call and asks
     * whether it began above the deck — from `lastTop`, which starts at 0.
     * Back from a project that read as arriving from the hero, and the
     * arrival rule pinned the deck to the first project instead of the one
     * being returned to. The handler is told where the scroller already is.
     */
    lastTop.current = el.scrollTop;
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
    // Not until the cards are on the screen: a card thrown while the deck is
    // still rising is a collision, not a deal.
    if (!idle || !dealt || reduced) return;
    /**
     * A chain of timeouts rather than one interval, because the first wait is
     * longer than the rest: the card you arrive on gets a proper look before
     * the deck starts turning over.
     */
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      timer = setTimeout(tick, HOME_IDLE.every);
      // Nothing dealt into a hidden tab: the timer would bank a dozen turns
      // and pay them out in one riffle the moment it came back.
      if (document.visibilityState !== "visible") return;
      // A hand on the deck owns it.
      if (deckDriven.current) return;
      /**
       * Only on the landing screen, read from the ref, not the state.
       *
       * The state is what tears this timer down when the page is scrolled,
       * but that happens on React's next commit, and a tick already due can
       * run in the gap between the scroll event and that commit — one card
       * turned, on the deck, with no hand on it. The ref is written in the
       * scroll handler itself, so it is never behind.
       */
      if (!idling.current) return;
      const next = pTarget.get() + 1;
      if (next >= n) {
        rebaseDeck(1);
        pTarget.set(next - n);
      } else {
        pTarget.set(next);
      }
    };
    timer = setTimeout(tick, HOME_IDLE.first);
    return () => clearTimeout(timer);
  }, [idle, dealt, reduced, n, pTarget, rebaseDeck, deckDriven]);

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
          jumpTarget.current = deckTop(to);
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
        jumpTarget.current = deckTop(Math.round(pTarget.get()));
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
  const heroFade = mobile ? HERO_EXIT.fade.mobile : HERO_EXIT.fade.desktop;
  const heroOpacity = useTransform(pi, (v) =>
    Math.max(0, 1 - v * heroFade),
  );
  /**
   * On the fade's clock, not the intro's, so the two finish together and read
   * as one gesture rather than as a scale that carries on invisibly.
   */
  const heroScale = useTransform(pi, (v) =>
    reduced ? 1 : 1 - (1 - HERO_EXIT.scale) * clamp01(v * heroFade),
  );
  const chromeOpacity = useTransform(pi, (v) => clamp01((v - 0.45) * 2.2));
  /** The phone's title block, cued once the deck has arrived. See CHROME_IN. */
  const [chromeIn, setChromeIn] = useState(() => pi.get() >= CHROME_IN.at);
  useMotionValueEvent(pi, "change", (v) => {
    setChromeIn((was) => (was ? v >= CHROME_IN.out : v >= CHROME_IN.at));
  });
  /**
   * Whether the deck has arrived, for the ledger's rows to rise to. Cued
   * where the ledger starts to show, released lower on the way back up, so
   * a scroll hovering on the threshold does not flutter the rows.
   */
  const [ledgerIn, setLedgerIn] = useState(() => pi.get() >= LEDGER_IN.at);
  useMotionValueEvent(pi, "change", (v) => {
    setLedgerIn((was) => (was ? v >= LEDGER_IN.out : v >= LEDGER_IN.at));
  });

  const s = stage.s;
  const ts = stage.ts;

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      onTouchStart={releaseCommit}
      onWheel={releaseCommit}
      className="no-scrollbar"
      style={{
        position: "fixed",
        inset: 0,
        /**
         * No scrolling until the cards have dealt in. Scrolling into a deck
         * that was still rising cut the deal short and landed on a stack
         * mid-motion; the landing screen holds until the fan is in.
         */
        overflowY: playIntro && !dealt ? "hidden" : "auto",
        /**
         * No rubber-band. The body already refuses to overscroll, but that
         * setting does not reach a scroll container of its own, and this
         * one bounced: pulling past the top dragged the header and the
         * sentence down while the cards — drawn outside this container —
         * stayed put, so the nav looked loose rather than fixed.
         */
        overscrollBehaviorY: "none",
        overflowX: "hidden",
        // `proximity` rather than `mandatory`: the deck is a scrubber, and
        // mandatory snapping fights a scroll that is mid-shuffle.
        scrollSnapType: "y proximity",
        /**
         * On a phone the page sits ABOVE the card layer (40), so the touch
         * sheet inside it is what the thumb lands on and the page can
         * scroll from anywhere. The sheet hands the cards what is not a
         * scroll. The scroller is a stacking context of its own, so nothing
         * inside it can rise above the cards unless it does. On desktop
         * the pointer has to reach the cards directly, so it stays below.
         */
        zIndex: mobile ? 41 : undefined,
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
            <HeroTunePanel />
            {/*
              On a phone the page takes every touch first, and hands the
              cards what is not a scroll. Above the card layer (40), below
              the sentence and the title block, which keep their own order.
            */}
            {mobile ? <DeckTouch zIndex={45} /> : null}

            <motion.div
              style={{
                position: "absolute",
                left: mobile ? 24 : 0,
                right: mobile ? 24 : 0,
                top: stageY(stage, mobile ? HERO_SEAT.mobile : HERO_SEAT.desktop),
                zIndex: 52,
                display: "flex",
                justifyContent: "center",
                opacity: heroOpacity,
                scale: heroScale,
                y: heroY,
                pointerEvents: "none",
              }}
            >
              <h1
                ref={heroBox}
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
                <HeroType
                  key={introKey}
                  play={playIntro || introKey > 0}
                  centre={mobile ? HERO_TYPE.centre.mobile : HERO_TYPE.centre.desktop}
                  typed="Hey,"
                  words={[
                    "I\u2019m",
                    "Remington",
                    "and",
                    "I",
                    "make",
                    "software",
                    "come",
                    "to",
                    "life",
                    "with",
                    "motion.",
                  ]}
                  onDone={dealIn}
                />
              </h1>
            </motion.div>

            {mobile ? (
              <motion.div
                style={{
                  position: "absolute",
                  left: 24,
                  right: 24,
                  // Above the home indicator, where there is one.
                  bottom: stage.top + stage.safeBottom + 36 * s,
                  zIndex: 56,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 9,
                  textAlign: "center",
                }}
                // Starts where it is, no fade on mount: back from a project
                // the deck is already seated and the title is simply there.
                initial={false}
                animate={{ opacity: chromeIn ? 1 : 0 }}
                transition={{
                  duration: chromeIn ? CHROME_IN.fade : CHROME_IN.fadeOut,
                  delay: chromeIn ? CHROME_IN.delay : 0,
                  ease: "linear",
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
                <Ledger front={front} onJump={jumpTo} arrived={ledgerIn} entrance={returned ? "fade" : "rise"} />
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
