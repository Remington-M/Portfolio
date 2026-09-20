/**
 * Warm a project's clips into the HTTP cache once someone opens it.
 *
 * The shots are stepped through at reading pace — several seconds a shot — and
 * for most of that time the connection is doing nothing. Spending it on the
 * clips that are about to be needed is what turns the wait in
 * `lib/playback.ts` from something a visitor sits through into something that
 * has already happened by the time they reach it.
 *
 * A plain `fetch` is the whole mechanism. The response lands in the HTTP cache
 * and the `<video>` that asks for the same URL later is served from it — on a
 * 2.81 MB clip, measured, the element pulled 0 bytes from the network. There
 * is no second copy in memory, no blob URL, and nothing for the media layer to
 * know about.
 */
import type { Project } from "./projects";
import { media } from "./asset";

/**
 * Every clip a project will ask for, in the order it will ask.
 *
 * The hero is deliberately absent. Its `<video>` is already fetching it by the
 * time this runs, and a second request for a response still in flight is a
 * second download rather than a cache hit — the entry is not there to share
 * yet. It is also the one clip nobody waits for twice.
 */
export function clipsToWarm(project: Project): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const shot of project.shots) {
    const url = media(shot.src);
    if (!url || url === media(project.src) || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

/**
 * Fetch each URL, one at a time, until the list runs out or `signal` aborts.
 *
 * Sequential rather than all at once, and that is the important part. Parallel
 * requests split whatever bandwidth there is, so the clip needed next finishes
 * no sooner than the clip needed last — which on a slow connection is the
 * difference between arriving in time and arriving after the visitor did. One
 * at a time in shot order means each clip is ready in the order it is wanted.
 *
 * `priority: "low"` keeps the queue behind the clip currently playing, which
 * the browser schedules as media. Unsupported elsewhere, where it is ignored
 * and the sequencing carries it on its own.
 */
export async function warmClips(
  urls: string[],
  signal: AbortSignal,
): Promise<void> {
  for (const url of urls) {
    if (signal.aborted) return;
    try {
      await fetch(url, {
        signal,
        credentials: "omit",
        priority: "low",
      } as RequestInit);
    } catch {
      /* Aborted, offline, or a 404 — the clip simply is not warm, and the
       * element will fetch it the old way. Never worth surfacing. */
      if (signal.aborted) return;
    }
  }
}

/**
 * Whether to warm at all.
 *
 * Save-Data is an explicit request not to spend bytes on something the visitor
 * has not asked for, and a clip they may never step to is exactly that. Under
 * it the site still works: every clip is fetched when it is reached.
 */
export function mayWarm(): boolean {
  if (typeof navigator === "undefined") return false;
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } })
    .connection;
  return !conn?.saveData;
}
