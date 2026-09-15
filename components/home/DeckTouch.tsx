"use client";

import { useCallback, useEffect, useRef } from "react";
import { DRAG } from "@/lib/design";

/**
 * The touch surface over the deck on a phone.
 *
 * The cards are drawn in a fixed layer that sits beside the page scroller,
 * not inside it, so a touch that lands on a card belongs to the card and
 * can never scroll the page — whatever the card then decides to do with it.
 * On desktop that is fine: the wheel scrolls and the pointer drags. On a
 * phone the same thumb has to do both, so the page needs the touch first.
 *
 * This sheet sits INSIDE the scroller, over the whole stage and above the
 * cards. A vertical swipe on it is a scroll, taken natively by the browser
 * through `touch-action: pan-y`. Anything else — a sideways drag, a tap — is
 * handed to whatever card is under the finger by re-dispatching the pointer
 * events at it, so the throw and the open work exactly as they did. When
 * the browser claims a swipe for scrolling it cancels the pointer, and the
 * cancel is forwarded too, so a card that had started to follow lets go.
 */
export default function DeckTouch({ zIndex }: { zIndex: number }) {
  const sheet = useRef<HTMLDivElement>(null);
  /** The element under the finger at the start of the press. */
  const target = useRef<Element | null>(null);
  /** Where the touch began, to tell a sideways drag from a scroll. */
  const origin = useRef<{ x: number; y: number } | null>(null);

  /**
   * Keep a sideways drag out of the browser's hands.
   *
   * `touch-action: pan-y` lets the browser start a scroll on its own, and
   * once it has, it cancels the pointer — mid-throw, if the swipe curved.
   * Scrolling can still be refused from a touchmove listener as long as it
   * is not passive and the scroll has not begun, so a touch that is plainly
   * moving sideways refuses it here on every move. A vertical one is left
   * alone and scrolls.
   */
  useEffect(() => {
    const el = sheet.current;
    if (!el) return;
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      origin.current = t ? { x: t.clientX, y: t.clientY } : null;
    };
    const onMove = (e: TouchEvent) => {
      const o = origin.current;
      const t = e.touches[0];
      if (!o || !t) return;
      const dx = Math.abs(t.clientX - o.x);
      const dy = Math.abs(t.clientY - o.y);
      if (dx > dy && dx > DRAG.moveThreshold && e.cancelable) e.preventDefault();
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
    };
  }, []);

  /**
   * The card under the finger, or null over bare page.
   *
   * The page sits above the card layer on a phone, so a plain hit test
   * returns the page; the stack of everything at the point is searched for
   * the first thing in the card layer instead. Elements transparent to the
   * pointer are already left out, so an inert card is never found.
   */
  const under = useCallback((x: number, y: number) => {
    const layer = document.querySelector("[data-deck-layer]");
    if (!layer) return null;
    return document.elementsFromPoint(x, y).find((el) => layer.contains(el)) ?? null;
  }, []);

  const forward = useCallback((e: React.PointerEvent, to: Element | null) => {
    if (!to) return;
    const n = e.nativeEvent;
    to.dispatchEvent(
      new PointerEvent(n.type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        pointerId: n.pointerId,
        pointerType: n.pointerType,
        isPrimary: n.isPrimary,
        button: n.button,
        buttons: n.buttons,
        clientX: n.clientX,
        clientY: n.clientY,
        screenX: n.screenX,
        screenY: n.screenY,
      }),
    );
  }, []);

  const down = useCallback(
    (e: React.PointerEvent) => {
      target.current = under(e.clientX, e.clientY);
      forward(e, target.current);
    },
    [under, forward],
  );
  const move = useCallback((e: React.PointerEvent) => forward(e, target.current), [forward]);
  const end = useCallback(
    (e: React.PointerEvent) => {
      forward(e, target.current);
      target.current = null;
    },
    [forward],
  );
  const click = useCallback(
    (e: React.MouseEvent) => {
      const to = under(e.clientX, e.clientY);
      if (!to) return;
      to.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          composed: true,
          clientX: e.clientX,
          clientY: e.clientY,
          button: e.button,
        }),
      );
    },
    [under],
  );

  return (
    <div
      ref={sheet}
      aria-hidden
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onClick={click}
      style={{
        position: "absolute",
        inset: 0,
        zIndex,
        // Vertical is the page's. Everything else comes here.
        touchAction: "pan-y",
        WebkitTapHighlightColor: "transparent",
      }}
    />
  );
}
