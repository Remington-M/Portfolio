"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { motionValue, type MotionValue } from "motion/react";
import { usePathname } from "next/navigation";
import { BREAKPOINT } from "@/lib/design";
import { makeStage, type Stage } from "@/lib/geometry";
import { projectIndex } from "@/lib/projects";

/**
 * Shared stage state.
 *
 * Everything the media layer reads each frame lives in MotionValues rather than
 * React state. The home deck drives ~13 elements from one scroll position; a
 * setState per scroll event would mean a full React render per frame, which is
 * what drops frames on a phone. MotionValues write styles outside the render
 * cycle entirely, so scrolling never re-renders anything.
 */
export type StageState = {
  /**
   * Home deck position, as currently rendered. Fractional, because the shuffle
   * is a continuous path — but it is no longer written by the scroll. The
   * media layer animates it toward `pTarget`.
   */
  p: MotionValue<number>;
  /**
   * The card the deck is committed to, always a whole number.
   *
   * Scroll and throws both resolve to this rather than driving the deck
   * directly, which is what makes going to the back a single animation instead
   * of something a slow scroll can leave parked half way through the arc.
   */
  pTarget: MotionValue<number>;
  /** Hero-to-deck intro progress, 0–1. */
  pi: MotionValue<number>;
  /** Project page shot position. */
  cp: MotionValue<number>;
  /** Index of the project whose card is the shared element, or -1. */
  selected: MotionValue<number>;
  /** Viewport, mirrored into MotionValues so the layer can read it per frame. */
  vw: MotionValue<number>;
  vh: MotionValue<number>;

  /** Route-level state. Changes rarely, so plain React state is right here. */
  mode: "home" | "case";
  mobile: boolean;
  stage: Stage;
  /** Bumped whenever the route changes, to retarget the springs. */
  transitionKey: number;

  /**
   * Deck position is preserved across navigation, per the handoff. null means
   * "never visited" — distinct from position 0, which is a real deck position.
   */
  restoreDeck: () => number | null;
  rememberDeck: (value: number) => void;

  /**
   * True while the media layer is driving the deck itself — a card is being
   * dragged or is mid-fling.
   *
   * The deck's position normally comes from a scroll container, so a gesture
   * and the scroller would otherwise fight: the gesture writes `p`, the next
   * scroll event overwrites it, and the card snaps back. While this is set,
   * Home stops writing `p` and lets the gesture own it; when the gesture ends
   * the resulting position is committed back to the scroller so the two agree
   * again and normal scrolling resumes from where the card landed.
   */
  deckDriven: MutableRefObject<boolean>;
  /** Home registers a way to put its scroller at a given deck position. */
  registerDeckScroll: (fn: ((value: number) => void) | null) => void;
  /** Hand a gesture's final deck position back to the scroller. */
  commitDeck: (value: number) => void;
};

const StageContext = createContext<StageState | null>(null);

export function useStage(): StageState {
  const ctx = useContext(StageContext);
  if (!ctx) throw new Error("useStage must be used inside <StageProvider>");
  return ctx;
}

export function StageProvider({ children }: { children: ReactNode }) {
  const values = useMemo(
    () => ({
      p: motionValue(0),
      pTarget: motionValue(0),
      pi: motionValue(0),
      cp: motionValue(0),
      selected: motionValue(-1),
      vw: motionValue(0),
      vh: motionValue(0),
    }),
    [],
  );

  const pathname = usePathname();
  const mode: "home" | "case" = pathname?.startsWith("/work/") ? "case" : "home";

  const [viewport, setViewport] = useState({ w: 0, h: 0, mobile: false });
  const [transitionKey, setTransitionKey] = useState(0);

  /**
   * Deck position survives a round trip to a project page, so returning home
   * doesn't reset the deck to the first project. Home writes to this
   * continuously, so a browser back button restores just as well as the
   * in-page return links do.
   */
  const deckMemo = useRef<number | null>(null);

  const deckDriven = useRef(false);
  const deckScroll = useRef<((value: number) => void) | null>(null);

  const registerDeckScroll = useCallback(
    (fn: ((value: number) => void) | null) => {
      deckScroll.current = fn;
    },
    [],
  );

  const commitDeck = useCallback((value: number) => {
    deckScroll.current?.(value);
  }, []);

  // Keep the selected project in sync with the URL, so a deep link or a back
  // button lands with the right card as the shared element.
  useEffect(() => {
    const slug = pathname?.startsWith("/work/")
      ? pathname.slice("/work/".length)
      : null;
    values.selected.set(slug ? projectIndex(slug) : -1);
    setTransitionKey((k) => k + 1);
  }, [pathname, values.selected]);

  useEffect(() => {
    const sync = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      values.vw.set(w);
      values.vh.set(h);
      setViewport((prev) => {
        const mobile = w < BREAKPOINT.desktop;
        if (prev.w === w && prev.h === h && prev.mobile === mobile) return prev;
        return { w, h, mobile };
      });
    };
    sync();
    window.addEventListener("resize", sync, { passive: true });
    window.addEventListener("orientationchange", sync);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
    };
  }, [values.vw, values.vh]);

  const stage = useMemo(
    () => makeStage(viewport.w, viewport.h, viewport.mobile),
    [viewport.w, viewport.h, viewport.mobile],
  );

  const state = useMemo<StageState>(
    () => ({
      ...values,
      mode,
      mobile: viewport.mobile,
      stage,
      transitionKey,
      restoreDeck: () => deckMemo.current,
      rememberDeck: (value: number) => {
        deckMemo.current = value;
      },
      deckDriven,
      registerDeckScroll,
      commitDeck,
    }),
    [
      values,
      mode,
      viewport.mobile,
      stage,
      transitionKey,
      registerDeckScroll,
      commitDeck,
    ],
  );

  return (
    <StageContext.Provider value={state}>{children}</StageContext.Provider>
  );
}
