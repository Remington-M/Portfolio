/**
 * Whether the tuning panels' keyboard shortcuts are live.
 *
 * The panels are workshop tools, and they opened on a bare keypress — `T` on
 * a project, `H` on the landing page and About — for anyone, on the
 * published site. A visitor who brushed the key got a panel of sliders over
 * the work. In development the keys stay as they were. In production they
 * do nothing unless the URL carries `?tune`, which is also what opens a
 * panel there in the first place: the tools are still reachable on the live
 * site, by someone who means to reach them.
 */
export function tuneKeysLive(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return new URLSearchParams(window.location.search).has("tune");
}
