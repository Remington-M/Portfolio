/**
 * Regression tests for the deck's motion invariants.
 *
 * These all describe things that are obvious to look at and invisible in a
 * screenshot, which is why they are asserted here. In particular the clearance
 * check samples where cards are ACTUALLY RENDERED on every frame, not where the
 * geometry says they should be — the two disagree by design, because position
 * is a spring chasing the scroll while z-index cannot lag, and checking the
 * target instead of the render is exactly how the punch-through was missed.
 *
 *   node scripts/verify-deck.mjs [baseUrl]
 *
 * Requires a running server (`npm run build && npm start`).
 */
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:3000";
const CHROME = process.env.CHROME_PATH;

// Mirrors DECK.desktop in lib/design.ts.
const INTRO = 440;
const HOLD = 300;
const STEP = 440;
const topFor = (v) => (v <= 0 ? INTRO + HOLD / 2 : INTRO + HOLD + v * STEP);

const browser = await chromium.launch({
  ...(CHROME ? { executablePath: CHROME } : {}),
  args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"],
});
const failures = [];
const note = (m) => console.log("  " + m);

/**
 * Installed into the page before each measurement.
 *
 * Attached to `window` rather than declared as locals: this is run through
 * eval inside an evaluate callback, and in strict mode eval keeps its own
 * declarations to itself, so locals would be invisible to the code that
 * follows it.
 */
const PROBE = `
  window.__cards = () => {
    const layer = [...document.querySelectorAll("div")].find((d) => {
      const cs = getComputedStyle(d);
      return cs.position === "fixed" && cs.zIndex === "40";
    });
    return [...layer.firstElementChild.children];
  };
  window.__shoot = () => window.__cards().map((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const m = new DOMMatrixReadOnly(cs.transform);
    return {
      left: r.left, right: r.right, top: r.top,
      z: parseInt(cs.zIndex, 10) || 0,
      opacity: parseFloat(cs.opacity),
      rot: Math.atan2(m.b, m.a) * 180 / Math.PI,
    };
  });
  window.__scroller = () => [...document.querySelectorAll("div")]
    .find((d) => d.scrollHeight > d.clientHeight + 50);
`;

/** Drive the scroller from one position to another, sampling every frame. */
async function sweep(page, from, to, ms) {
  return page.evaluate(
    async ([from, to, ms, probe]) => {
      eval(probe);
      const scroller = window.__scroller();
      const samples = [];
      const t0 = performance.now();
      return await new Promise((resolve) => {
        const frame = (now) => {
          const k = Math.min(1, (now - t0) / ms);
          if (k < 1) scroller.scrollTop = from + (to - from) * k;
          samples.push(window.__shoot());
          // Keep sampling after the scroll stops: the move is now a committed
          // animation that plays out on its own, and the arc it sweeps through
          // is exactly what has to be checked.
          if (k < 1) requestAnimationFrame(frame);
          else if (now - t0 < ms + 3000) requestAnimationFrame(frame);
          else resolve(samples);
        };
        requestAnimationFrame(frame);
      });
    },
    [from, to, ms, PROBE],
  );
}

/**
 * Did the card travel around the OUTSIDE of the stack?
 *
 * This is the property that matters, and it is stated positively on purpose.
 * Asking instead "did it ever drop behind while overlapping" flags two things
 * that are correct: tucking back in behind the stack, and arriving at its
 * resting place at the back — which is inside the stack footprint by
 * definition. What actually distinguishes going around from going through is
 * whether there was a moment when the card was BOTH fully clear of every other
 * card AND still painted in front of them.
 *
 * Extents come from bounding boxes, which for a rotated card reach roughly
 * 30px further out each side than its width — the same measure the layer
 * itself has to use, and getting that wrong is what let a card clear "on
 * paper" while still visibly over the corner of the one beneath it.
 */
function wentAround(samples, card) {
  let best = -Infinity;
  for (const shot of samples) {
    const c = shot[card];
    if (c.z < 60) continue; // only counts while still in front
    const othersRight = Math.max(
      ...shot.filter((_, j) => j !== card).map((o) => o.right),
    );
    best = Math.max(best, c.left - othersRight);
  }
  return best;
}

const newPage = () => browser.newPage({ viewport: { width: 1440, height: 900 } });

/* -------------------------------------------------------------- *
 * 1. The deck must not fly in from the corner on load.
 * -------------------------------------------------------------- */
{
  const page = await newPage();
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  /**
   * Measured only across frames where the cards are actually VISIBLE. They
   * start fully transparent at the origin and are placed on the first frame
   * the stage has been measured, so counting from before they are painted
   * would report a fly-in that nobody can see.
   */
  const travel = await page.evaluate(async (probe) => {
    eval(probe);
    const frames = [];
    await new Promise((resolve) => {
      const t0 = performance.now();
      const step = (now) => {
        frames.push(window.__shoot());
        if (now - t0 < 1500) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
    let worst = 0;
    for (let i = 0; i < frames[0].length; i++) {
      let seen = null;
      for (const f of frames) {
        const c = f[i];
        if (c.opacity < 0.05) continue;
        if (seen)
          worst = Math.max(
            worst,
            Math.hypot(c.left - seen.left, c.top - seen.top),
          );
        else seen = c;
      }
    }
    return worst;
  }, PROBE);
  if (travel > 60)
    failures.push(`deck flew in on load — cards moved ${travel.toFixed(0)}px after first paint`);
  else note(`load settles in place (max drift ${travel.toFixed(0)}px)`);
  await page.close();
}

/* -------------------------------------------------------------- *
 * 2. The front card is square to the viewer.
 * -------------------------------------------------------------- */
{
  const page = await newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate((t) => {
    const el = [...document.querySelectorAll("div")]
      .find((d) => d.scrollHeight > d.clientHeight + 50);
    el.scrollTop = t;
  }, topFor(0));
  await page.waitForTimeout(1600);
  const rot = await page.evaluate((probe) => {
    eval(probe);
    const shot = window.__shoot();
    const front = shot.reduce((a, b) => (b.z > a.z ? b : a));
    return front.rot;
  }, PROBE);
  if (Math.abs(rot) > 0.5)
    failures.push(`front card is angled ${rot.toFixed(2)}deg — should be upright`);
  else note(`front card upright (${rot.toFixed(2)}deg)`);
  await page.close();
}

/* -------------------------------------------------------------- *
 * 3. A card going to the back travels around the stack, not through it,
 *    at every speed. One card per sweep: scrolling hard enough to commit
 *    several at once is a different question from whether the move is right.
 * -------------------------------------------------------------- */
for (const [label, ms] of [["fast", 160], ["normal", 620], ["slow", 1300]]) {
  const page = await newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate((t) => {
    const el = [...document.querySelectorAll("div")]
      .find((d) => d.scrollHeight > d.clientHeight + 50);
    el.scrollTop = t;
  }, topFor(0));
  await page.waitForTimeout(1400);
  const samples = await sweep(page, topFor(0), topFor(1), ms);
  const margin = wentAround(samples, 0);
  if (!(margin > 0))
    failures.push(
      `${label} scroll: card never cleared the stack while in front (best ${margin.toFixed(0)}px — it went through, not around)`,
    );
  else note(`${label} scroll (${ms}ms): went around, cleared by ${margin.toFixed(0)}px`);
  await page.close();
}

/* -------------------------------------------------------------- *
 * 4. Flinging one card must not drag the next one out with it.
 * -------------------------------------------------------------- */
{
  const page = await newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate((t) => {
    const el = [...document.querySelectorAll("div")]
      .find((d) => d.scrollHeight > d.clientHeight + 50);
    el.scrollTop = t;
  }, topFor(0));
  await page.waitForTimeout(1400);

  const c = await page.evaluate((probe) => {
    eval(probe);
    const shot = window.__shoot();
    const front = shot.reduce((a, b) => (b.z > a.z ? b : a));
    return { x: (front.left + front.right) / 2, y: front.top + 200 };
  }, PROBE);

  // Start sampling, then throw the front card while it runs.
  const watch = page.evaluate(async (probe) => {
    eval(probe);
    const samples = [];
    const t0 = performance.now();
    return await new Promise((resolve) => {
      const frame = (now) => {
        samples.push(window.__shoot());
        if (now - t0 < 2600) requestAnimationFrame(frame);
        else resolve(samples);
      };
      requestAnimationFrame(frame);
    });
  }, PROBE);

  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  for (let k = 1; k <= 8; k++) {
    await page.mouse.move(c.x + k * 26, c.y - k * 2);
    await page.waitForTimeout(8);
  }
  await page.mouse.up();

  const samples = await watch;
  // The card that ends up at the front is the one that must not have been
  // dragged along. Track how far right of its final resting place it strayed.
  const last = samples[samples.length - 1];
  const frontIdx = last.indexOf(last.reduce((a, b) => (b.z > a.z ? b : a)));
  const restX = last[frontIdx].left;
  let excursion = 0;
  for (const shot of samples.slice(Math.floor(samples.length / 3))) {
    excursion = Math.max(excursion, shot[frontIdx].left - restX);
  }
  if (excursion > 40)
    failures.push(
      `fling dragged the next card ${excursion.toFixed(0)}px to the right with it`,
    );
  else note(`fling leaves the next card in place (strayed ${excursion.toFixed(0)}px)`);
  await page.close();
}

await browser.close();

if (failures.length) {
  console.error("FAIL\n  " + failures.join("\n  "));
  process.exit(1);
}
console.log("PASS: deck settles on load, front card upright, cards go around the stack, fling is local");
