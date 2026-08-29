/**
 * Regression test for the load-bearing invariant of this site's architecture:
 * a playing video must survive a navigation from the home deck to a project
 * page without being torn down and rebuilt.
 *
 * The persistent media layer exists solely to make this true. If this test
 * fails, the layer has stopped being persistent — most likely because a card
 * was moved into a page component, or something above it in the tree started
 * remounting on navigation.
 *
 *   node scripts/verify-continuity.mjs [baseUrl]
 *
 * Requires a running server (`npm run build && npm start`).
 */
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:3000";
const CHROME = process.env.CHROME_PATH;

const browser = await chromium.launch({
  ...(CHROME ? { executablePath: CHROME } : {}),
  args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const failures = [];
page.on("pageerror", (e) => failures.push(`page error: ${e.message}`));

await page.goto(BASE, { waitUntil: "networkidle" });

// Scroll the deck in so a card with a clip is at the front.
await page.evaluate(() => {
  const el = [...document.querySelectorAll("div")].find(
    (d) => d.scrollHeight > d.clientHeight + 50,
  );
  el.scrollTop = 440;
  el.dispatchEvent(new Event("scroll", { bubbles: true }));
});
await page.waitForTimeout(1500);

const before = await page.evaluate(() => {
  const v = document.querySelector("video");
  if (!v) return null;
  // Tag the node so we can tell identity from mere resemblance after the nav.
  v.dataset.continuityProbe = Math.random().toString(36).slice(2);
  return {
    probe: v.dataset.continuityProbe,
    time: v.currentTime,
    paused: v.paused,
    decodable: v.readyState > 0,
  };
});

if (!before) {
  console.error("FAIL: no <video> on the home deck");
  await browser.close();
  process.exit(1);
}

await page.evaluate(() => {
  const link = [...document.querySelectorAll('a[href^="/work/"]')].find(
    (a) => !a.closest(".sr-only"),
  );
  link.click();
});
await page.waitForTimeout(1600);

const after = await page.evaluate(() => {
  const v = document.querySelector("video");
  if (!v) return null;
  return {
    probe: v.dataset.continuityProbe ?? null,
    time: v.currentTime,
    paused: v.paused,
  };
});

const url = page.url();
await browser.close();

if (!url.includes("/work/")) failures.push(`navigation did not happen (${url})`);
if (!after) failures.push("video element gone after navigation");
else if (after.probe !== before.probe)
  failures.push("video was remounted — the media layer is not persistent");

// Playback continuity can only be asserted where the browser can decode the
// clip. Chromium builds without proprietary codecs cannot play H.264 MP4;
// the node-identity check above still proves the architecture holds.
if (before.decodable && after) {
  if (after.paused) failures.push("playback stopped across the navigation");
  if (after.time <= before.time)
    failures.push(
      `playback restarted (${before.time.toFixed(2)}s -> ${after.time.toFixed(2)}s)`,
    );
  console.log(
    `playback: ${before.time.toFixed(2)}s -> ${after.time.toFixed(2)}s`,
  );
} else {
  console.log(
    "playback: not asserted — this browser cannot decode the clip (codec unavailable)",
  );
}

if (failures.length) {
  console.error("FAIL\n  " + failures.join("\n  "));
  process.exit(1);
}
console.log("PASS: same video element survived the navigation");
