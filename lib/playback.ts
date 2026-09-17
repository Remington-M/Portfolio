/**
 * When a clip is allowed to start.
 *
 * The clips are short loops of product UI, and the whole point of them is the
 * motion — how a card opens, how a list settles. A clip that starts the
 * instant the first frames arrive and then starves shows that motion at
 * whatever frame rate the network allows, which is the one way of showing it
 * that misrepresents the work. A still that waits and then runs properly is
 * the honest version, and the poster beside every clip means waiting costs a
 * frozen first frame rather than an empty frame.
 *
 * `readyState === HAVE_ENOUGH_DATA` is the platform's own word for this: not
 * "has some frames" but "could play to the end without stopping", judged
 * against the bandwidth it is actually getting. Waiting for it is the whole
 * mechanism; there is nothing to hand-roll.
 */

/** `HTMLMediaElement.HAVE_ENOUGH_DATA`, without needing an element to read it off. */
const HAVE_ENOUGH_DATA = 4;

/**
 * How long to hold the still before giving up and playing anyway.
 *
 * Not forever. On a connection bad enough that the browser never reaches
 * HAVE_ENOUGH_DATA, holding indefinitely means the site never moves at all,
 * which is worse than moving badly — so the cap degrades to exactly the old
 * behaviour rather than to nothing. Generous enough that a normal connection
 * never reaches it: the heaviest clip on the site is 4.6 MB, which is inside
 * this on anything from about 4 Mb/s up.
 */
export const PLAY_WAIT_CAP_MS = 10_000;

/**
 * Start `el` once it can play through, and return the teardown for that wait.
 *
 * Three paths, and the first is the one almost every visitor takes:
 *
 *   - Already buffered — play now. No listener, no timer, no added latency. A
 *     clip that has been seen once, or a connection quick enough that the
 *     fetch finished during the transition, is unaffected by any of this.
 *   - Not yet — wait for `canplaythrough`, holding whatever the element is
 *     showing, which is its poster.
 *   - Still not, after the cap — play regardless.
 *
 * The caller is responsible for the element having data on the way at all:
 * `preload="metadata"` fetches a header and stops, so a clip left on it would
 * sit at readyState 1 and `canplaythrough` would never fire. The active clip
 * has to be on `preload="auto"` for this to terminate on anything but the cap.
 */
export function playWhenReady(el: HTMLVideoElement): () => void {
  const start = () => {
    const played = el.play();
    if (played && played.catch) played.catch(() => {});
  };

  if (el.readyState >= HAVE_ENOUGH_DATA) {
    start();
    return () => {};
  }

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    el.removeEventListener("canplaythrough", finish);
    clearTimeout(timer);
    start();
  };

  const timer = setTimeout(finish, PLAY_WAIT_CAP_MS);
  el.addEventListener("canplaythrough", finish);

  return () => {
    done = true;
    el.removeEventListener("canplaythrough", finish);
    clearTimeout(timer);
  };
}

/**
 * What `preload` a clip should carry, given whether it is the one playing.
 *
 * The active clip needs the whole file on its way so it can reach
 * HAVE_ENOUGH_DATA. Everything else stays on metadata, which is what keeps a
 * shot two steps away costing a few kilobytes instead of a few megabytes —
 * the reason the attribute was set to metadata in the first place.
 */
export function preloadFor(active: boolean): "auto" | "metadata" {
  return active ? "auto" : "metadata";
}
