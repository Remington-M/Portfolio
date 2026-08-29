/**
 * Regression test for the deck's direct manipulation.
 *
 * The front card carries two gestures that share a pointer: a click opens the
 * project, and a press-and-drag throws the card to the back. They are easy to
 * break in opposite directions — a drag that still navigates, or a click that
 * no longer does — and neither is visible from a screenshot, so they are
 * asserted here in a real browser.
 *
 *   node scripts/verify-gesture.mjs [baseUrl]
 *
 * Requires a running server (`npm run build && npm start`).
 */
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:3000";
const CHROME = process.env.CHROME_PATH;

// Mirrors DECK.desktop in lib/design.ts. The dwell is why the first project
// does not start shuffling the moment the intro ends.
const INTRO = 440;
const HOLD = 300;
const STEP = 440;
/** Scroll position at which the deck sits at whole project `v`. */
const topFor = (v) => (v <= 0 ? INTRO + HOLD / 2 : INTRO + HOLD + v * STEP);

const browser = await chromium.launch({
  ...(CHROME ? { executablePath: CHROME } : {}),
  args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"],
});

const failures = [];
const note = (m) => console.log("  " + m);

/** Put the deck on screen and return the front card's centre. */
async function openDeck(page) {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate((top) => {
    const el = [...document.querySelectorAll("div")].find(
      (d) => d.scrollHeight > d.clientHeight + 50,
    );
    el.scrollTop = top;
  }, topFor(0));
  await page.waitForTimeout(1400);
  return page.evaluate(() => {
    // The front card is the one the layer left interactive.
    const cards = [...document.querySelectorAll("div")].filter(
      (d) => getComputedStyle(d).pointerEvents === "auto" && d.querySelector("a"),
    );
    const el = cards[cards.length - 1];
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
}

const deckP = (page) =>
  page.evaluate(
    ([intro, hold, step]) => {
      const el = [...document.querySelectorAll("div")].find(
        (d) => d.scrollHeight > d.clientHeight + 50,
      );
      return Math.max(0, (el.scrollTop - intro - hold) / step);
    },
    [INTRO, HOLD, STEP],
  );

/* -------------------------------------------------------------- *
 * 1. A plain click still opens the project.
 * -------------------------------------------------------------- */
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const c = await openDeck(page);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(900);
  const url = page.url();
  if (!url.includes("/work/"))
    failures.push(`a plain click did not navigate (still at ${url})`);
  else note(`click -> ${url.replace(BASE, "")}`);
  await page.close();
}

/* -------------------------------------------------------------- *
 * 2. A drag throws the card and does NOT navigate.
 * -------------------------------------------------------------- */
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const c = await openDeck(page);
  const before = await deckP(page);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  // Deliberately fast and far: past both the distance and velocity thresholds.
  for (let k = 1; k <= 8; k++) {
    await page.mouse.move(c.x + k * 26, c.y - k * 3);
    await page.waitForTimeout(8);
  }
  await page.mouse.up();
  await page.waitForTimeout(1800);

  const url = page.url();
  const after = await deckP(page);
  if (url.includes("/work/"))
    failures.push(`a drag navigated when it should not have (${url})`);
  else note("drag did not navigate");

  if (!(after > before + 0.5))
    failures.push(
      `fling did not send the card back (deck ${before.toFixed(2)} -> ${after.toFixed(2)})`,
    );
  else note(`fling advanced deck ${before.toFixed(2)} -> ${after.toFixed(2)}`);
  await page.close();
}

/* -------------------------------------------------------------- *
 * 3. A small nudge is still a click — under the slop it must navigate.
 * -------------------------------------------------------------- */
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const c = await openDeck(page);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + 3, c.y + 2);
  await page.mouse.up();
  await page.waitForTimeout(900);
  const url = page.url();
  if (!url.includes("/work/"))
    failures.push("a 3px nudge was treated as a drag rather than a click");
  else note("3px nudge -> still a click");
  await page.close();
}

/* -------------------------------------------------------------- *
 * 4. After a fling, normal scrolling still drives the deck. This is the one
 *    that catches the gesture forgetting to hand the deck back.
 * -------------------------------------------------------------- */
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const c = await openDeck(page);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  for (let k = 1; k <= 8; k++) {
    await page.mouse.move(c.x + k * 26, c.y);
    await page.waitForTimeout(8);
  }
  await page.mouse.up();
  await page.waitForTimeout(1800);

  const settled = await deckP(page);
  await page.evaluate((step) => {
    const el = [...document.querySelectorAll("div")].find(
      (d) => d.scrollHeight > d.clientHeight + 50,
    );
    el.scrollTop += step;
  }, STEP);
  await page.waitForTimeout(900);
  const scrolled = await deckP(page);
  if (!(scrolled > settled + 0.5))
    failures.push(
      `scrolling stopped working after a fling (${settled.toFixed(2)} -> ${scrolled.toFixed(2)})`,
    );
  else note(`scroll after fling ${settled.toFixed(2)} -> ${scrolled.toFixed(2)}`);
  await page.close();
}

/* -------------------------------------------------------------- *
 * 5. A throw to the LEFT sends the card around the left of the stack, and
 *    the release does not reverse the card's direction.
 *
 *    Both were reported by eye. The reversal is the "hitch": if letting go
 *    throws away the drag offset, the card's target snaps back toward the
 *    stack before the arc sweeps it out, so it briefly travels backwards.
 * -------------------------------------------------------------- */
for (const [label, sign] of [["left", -1], ["right", 1]]) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const c = await openDeck(page);

  const watch = page.evaluate(async () => {
    const layer = [...document.querySelectorAll("div")].find((d) => {
      const cs = getComputedStyle(d);
      return cs.position === "fixed" && cs.zIndex === "40";
    });
    const cards = [...layer.firstElementChild.children];
    const out = [];
    const t0 = performance.now();
    return await new Promise((res) => {
      const f = (now) => {
        out.push({
          t: now - t0,
          x: cards.map((el) => el.getBoundingClientRect().left),
        });
        if (now - t0 < 3000) requestAnimationFrame(f);
        else res(out);
      };
      requestAnimationFrame(f);
    });
  });

  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  for (let k = 1; k <= 8; k++) {
    await page.mouse.move(c.x + sign * k * 24, c.y);
    await page.waitForTimeout(10);
  }
  await page.mouse.up();
  const frames = await watch;
  await page.close();

  // The thrown card is whichever travels furthest from where it started.
  const start = frames[0].x;
  let card = 0;
  let far = 0;
  for (let i = 0; i < start.length; i++) {
    for (const f of frames)
      if (Math.abs(f.x[i] - start[i]) > far) {
        far = Math.abs(f.x[i] - start[i]);
        card = i;
      }
  }
  const track = frames.map((f) => f.x[card] - start[card]);
  const peak = sign > 0 ? Math.max(...track) : Math.min(...track);

  if (Math.sign(peak) !== sign)
    failures.push(
      `${label} throw sent the card the other way (peak ${peak.toFixed(0)}px)`,
    );
  else note(`${label} throw travels ${label} (peak ${peak.toFixed(0)}px)`);

  /**
   * Reversal check, over the release and settle. The card should keep going
   * the way it was thrown until it turns to tuck in behind — one turn is the
   * arc, but a turn back the way it came within a few frames of the release
   * is the hitch.
   */
  const release = frames.findIndex((f) => Math.abs(f.x[card] - start[card]) > 20);
  let backtrack = 0;
  for (let i = release + 1; i < Math.min(frames.length, release + 14); i++) {
    const step = track[i] - track[i - 1];
    if (Math.sign(step) === -sign) backtrack += Math.abs(step);
  }
  if (backtrack > 24)
    failures.push(
      `${label} throw hitched — card moved ${backtrack.toFixed(0)}px backwards just after release`,
    );
  else note(`  no hitch on release (${backtrack.toFixed(0)}px of backtrack)`);
}

await browser.close();

if (failures.length) {
  console.error("FAIL\n  " + failures.join("\n  "));
  process.exit(1);
}
console.log("PASS: click opens, drag throws either way without hitching, deck handed back");
