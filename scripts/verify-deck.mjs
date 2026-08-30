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
      scrim: (() => {
        const s = el.querySelector("[data-scrim]");
        return s ? parseFloat(getComputedStyle(s).opacity) : 0;
      })(),
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
 * Where in its arc did the departing card drop behind the stack?
 *
 * Returned as a fraction of how far it travelled. Near 1 means it went behind
 * at the outside of the swing, which is the card going AROUND the stack. Near
 * 0 means it rode along on top for the whole trip and only dropped behind once
 * it was already home, which is the card going THROUGH it.
 *
 * Checking that the card merely ACHIEVED clearance at some point while in
 * front is not enough — it passes just as happily when the flip is at the very
 * end, which is exactly the bug this missed.
 */
function flipPoint(samples, card) {
  const start = samples[0][card].left;
  const track = samples.map((s) => ({
    off: s[card].left - start,
    z: s[card].z,
  }));
  const peak = track.reduce((a, b) => (Math.abs(b.off) > Math.abs(a.off) ? b : a));
  const flip = track.find((r, i) => i > 0 && track[i - 1].z >= 60 && r.z < 50);
  if (!flip || !Math.abs(peak.off)) return { frac: 0, peak: peak.off };
  return { frac: Math.abs(flip.off) / Math.abs(peak.off), peak: peak.off };
}

/**
 * Where in its arc a card came back OUT to the front. The mirror of
 * `flipPoint`, for scrubbing back up the deck.
 */
function risePoint(samples, card) {
  const start = samples[0][card].left;
  const track = samples.map((s) => ({
    off: s[card].left - start,
    z: s[card].z,
  }));
  const peak = track.reduce((a, b) => (Math.abs(b.off) > Math.abs(a.off) ? b : a));
  const rise = track.find((r, i) => i > 0 && track[i - 1].z < 50 && r.z >= 60);
  if (!rise || !Math.abs(peak.off)) return { frac: null, peak: peak.off };
  return { frac: Math.abs(rise.off) / Math.abs(peak.off), peak: peak.off };
}

/** Whichever card moves furthest is the one on its way to the back. */
function departing(samples) {
  const start = samples[0].map((c) => c.left);
  let card = 0;
  let far = 0;
  for (let i = 0; i < start.length; i++)
    for (const s of samples)
      if (Math.abs(s[i].left - start[i]) > far) {
        far = Math.abs(s[i].left - start[i]);
        card = i;
      }
  return card;
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
 * 3. Every transition sends its card around the outside of the stack, and
 *    drops it behind AT the outside of the swing rather than once it is
 *    already home.
 *
 *    All five are checked because the seeded scatter is not uniform: a card
 *    with a large angle sitting deep in the stack juts much further out than
 *    the others, and that broke exactly one transition in five while the
 *    rest looked perfect. Testing a single hop hid it completely.
 * -------------------------------------------------------------- */
for (let v = 0; v < 5; v++) {
  const page = await newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate((t) => {
    const el = [...document.querySelectorAll("div")]
      .find((d) => d.scrollHeight > d.clientHeight + 50);
    el.scrollTop = t;
  }, topFor(v));
  await page.waitForTimeout(1500);
  const samples = await sweep(page, topFor(v), topFor(v + 1), 620);
  const card = departing(samples);
  const { frac, peak } = flipPoint(samples, card);
  if (!(frac > 0.55))
    failures.push(
      `card ${v} -> ${v + 1}: dropped behind at ${(frac * 100).toFixed(0)}% of its swing (peak ${peak.toFixed(0)}px) — it rode on top instead of going around`,
    );
  else
    note(
      `${v} -> ${v + 1}: goes behind at ${(frac * 100).toFixed(0)}% of a ${Math.abs(peak).toFixed(0)}px swing`,
    );
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

/* -------------------------------------------------------------- *
 * 5. Nothing on the deck is ever see-through.
 *
 *    Depth is carried by a wash of page colour painted ON each card, not by
 *    making the card transparent. So every card stays fully opaque at all
 *    times, and the wash is what varies with depth. Checked at rest and
 *    right through a shuffle, since the departing card was the worst
 *    offender — it used to drop to 0.61 at the very moment it was passing
 *    in front of the others.
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

  const atRest = await page.evaluate((probe) => {
    eval(probe);
    return window.__shoot().slice().sort((a, b) => b.z - a.z);
  }, PROBE);

  const sheer = atRest.filter((c) => c.opacity < 0.999);
  if (sheer.length)
    failures.push(
      `${sheer.length} card(s) transparent at rest: ${sheer.map((c) => c.opacity.toFixed(2)).join(", ")}`,
    );
  else
    note(
      `all solid at rest; depth wash: ${atRest.map((c) => c.scrim.toFixed(2)).join(", ")}`,
    );

  // The wash has to actually do something, or depth stops reading at all.
  const spread = Math.max(...atRest.map((c) => c.scrim));
  if (!(spread > 0.1))
    failures.push(`depth wash is flat (max ${spread.toFixed(2)}) — no depth cue left`);

  // And through a shuffle, including the card on its way round.
  const samples = await sweep(page, topFor(0), topFor(1), 620);
  let worst = 1;
  for (const shot of samples)
    for (const c of shot) worst = Math.min(worst, c.opacity);
  if (worst < 0.999)
    failures.push(
      `a card went ${worst.toFixed(2)} transparent during the shuffle — you can see through it`,
    );
  else note(`stays solid right through the shuffle (min ${worst.toFixed(3)})`);
  await page.close();
}

/* -------------------------------------------------------------- *
 * 6. Scrubbing back UP the deck. The card re-emerging from the back must
 *    come out over the top the same way it went in, not surface straight
 *    through the cards it is still behind.
 * -------------------------------------------------------------- */
for (let v = 3; v >= 1; v--) {
  const page = await newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate((t) => {
    const el = [...document.querySelectorAll("div")]
      .find((d) => d.scrollHeight > d.clientHeight + 50);
    el.scrollTop = t;
  }, topFor(v));
  await page.waitForTimeout(1500);
  const samples = await sweep(page, topFor(v), topFor(v - 1), 620);
  const card = departing(samples);
  const { frac, peak } = flipPoint(samples, card);
  // Going backwards the card starts behind and comes forward, so the flip we
  // look for is the other way round — measured the same way.
  const start = samples[0][card].left;
  const track = samples.map((s) => ({ off: s[card].left - start, z: s[card].z }));
  const rise = track.find((r, i) => i > 0 && track[i - 1].z < 50 && r.z >= 60);
  const pk = track.reduce((a, b) => (Math.abs(b.off) > Math.abs(a.off) ? b : a));
  const at = rise && Math.abs(pk.off) ? Math.abs(rise.off) / Math.abs(pk.off) : null;
  if (at !== null && at < 0.55)
    failures.push(
      `${v} -> ${v - 1}: card surfaced at ${(at * 100).toFixed(0)}% of its swing — it came up through the stack`,
    );
  else
    note(
      `${v} -> ${v - 1}: comes back over the top at ${at === null ? "n/a" : (at * 100).toFixed(0) + "%"}`,
    );
  await page.close();
}

/* -------------------------------------------------------------- *
 * 7. Jumping several cards at once — picking one off the ledger. EVERY
 *    card that transits on the way has to go around the stack, judged the
 *    same way as a single hop: it drops behind at the outside of its swing,
 *    not once it is already home.
 * -------------------------------------------------------------- */
{
  const page = await newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate((t) => {
    const el = [...document.querySelectorAll("div")]
      .find((d) => d.scrollHeight > d.clientHeight + 50);
    el.scrollTop = t;
  }, topFor(0));
  await page.waitForTimeout(1500);
  const samples = await sweep(page, topFor(0), topFor(4), 900);

  const bad = [];
  const ok = [];
  for (let i = 0; i < samples[0].length; i++) {
    const { frac, peak } = flipPoint(samples, i);
    // Only cards that actually made a trip — the rest just shuffle forward.
    if (Math.abs(peak) < 150) continue;
    if (frac > 0.55) ok.push(`${i}@${(frac * 100).toFixed(0)}%`);
    else bad.push(`card ${i} flipped at ${(frac * 100).toFixed(0)}% of a ${Math.abs(peak).toFixed(0)}px swing`);
  }
  if (bad.length)
    failures.push(`multi-card jump: ${bad.join("; ")}`);
  else note(`multi-card jump: all ${ok.length} transits go around (${ok.join(", ")})`);
  await page.close();
}

/* -------------------------------------------------------------- *
 * 8. Jumping several cards BACKWARDS — picking an earlier project off the
 *    ledger. Each card coming back out has to surface at the outside of its
 *    swing, not sit low in the stack until the move is over.
 * -------------------------------------------------------------- */
{
  const page = await newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate((t) => {
    const el = [...document.querySelectorAll("div")]
      .find((d) => d.scrollHeight > d.clientHeight + 50);
    el.scrollTop = t;
  }, topFor(4));
  await page.waitForTimeout(1600);
  const samples = await sweep(page, topFor(4), topFor(1), 900);

  const bad = [];
  const ok = [];
  for (let i = 0; i < samples[0].length; i++) {
    const { frac, peak } = risePoint(samples, i);
    if (Math.abs(peak) < 150) continue;
    if (frac === null)
      bad.push(`card ${i} never came back to the front (${Math.abs(peak).toFixed(0)}px swing)`);
    else if (frac > 0.55) ok.push(`${i}@${(frac * 100).toFixed(0)}%`);
    else
      bad.push(`card ${i} surfaced at ${(frac * 100).toFixed(0)}% of a ${Math.abs(peak).toFixed(0)}px swing`);
  }
  if (bad.length) failures.push(`backwards jump: ${bad.join("; ")}`);
  else note(`backwards jump: all ${ok.length} transits come out on top (${ok.join(", ")})`);
  await page.close();
}

/* -------------------------------------------------------------- *
 * 9. The arc is the same size however fast the deck is moved.
 *
 *    This is the property that a card's own clock buys. With the swing
 *    derived from deck position instead, moving the deck quickly squashed
 *    it flat — the card never reached full extent, so it never got out past
 *    the stack and cut through it. Same shape nudged or thrown.
 * -------------------------------------------------------------- */
{
  const swings = {};
  for (const [label, ms] of [["slow", 1300], ["fast", 120]]) {
    const page = await newPage();
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.evaluate((t) => {
      const el = [...document.querySelectorAll("div")]
        .find((d) => d.scrollHeight > d.clientHeight + 50);
      el.scrollTop = t;
    }, topFor(0));
    await page.waitForTimeout(1500);
    const samples = await sweep(page, topFor(0), topFor(1), ms);
    const card = departing(samples);
    const start = samples[0][card].left;
    swings[label] = Math.max(
      ...samples.map((s) => Math.abs(s[card].left - start)),
    );
    await page.close();
  }
  const ratio = swings.fast / swings.slow;
  if (ratio < 0.85)
    failures.push(
      `a fast move squashes the arc: ${swings.fast.toFixed(0)}px against ${swings.slow.toFixed(0)}px slow (${(ratio * 100).toFixed(0)}%)`,
    );
  else
    note(
      `arc holds its size at speed: ${swings.fast.toFixed(0)}px fast vs ${swings.slow.toFixed(0)}px slow (${(ratio * 100).toFixed(0)}%)`,
    );
}

/* -------------------------------------------------------------- *
 * 10. One trip out, one trip back — no retracing.
 *
 *     A clean arc turns around exactly once. Reading the card's direction
 *     from the deck spring's momentary velocity used to make it turn around
 *     three or four times on the way back: a settling spring's velocity
 *     crosses zero and wobbles, and the card followed every wobble, running
 *     its arc, reversing it, and running it again.
 * -------------------------------------------------------------- */
for (const [label, from, to] of [
  ["forwards", 0, 1],
  ["backwards", 3, 2],
  ["backwards jump", 4, 1],
]) {
  const page = await newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate((t) => {
    const el = [...document.querySelectorAll("div")]
      .find((d) => d.scrollHeight > d.clientHeight + 50);
    el.scrollTop = t;
  }, topFor(from));
  await page.waitForTimeout(1500);
  const samples = await sweep(page, topFor(from), topFor(to), 620);
  const card = departing(samples);
  const start = samples[0][card].left;
  const off = samples.map((s) => s[card].left - start);

  /**
   * Counts direction changes by how FAR the card then travels the new way,
   * not by how many times the sign flips.
   *
   * Springs settle by oscillating, so the last few frames of any move wobble a
   * pixel or two either side of the target and a plain sign count picks those
   * up — the check went green or red run to run on the same code. A retrace is
   * the card running its arc again, which is hundreds of pixels; settling is
   * single figures.
   */
  const legs = [];
  let dir = 0;
  let travelled = 0;
  for (let i = 1; i < off.length; i++) {
    const d = off[i] - off[i - 1];
    if (Math.abs(d) < 0.5) continue;
    const sgn = Math.sign(d);
    if (dir !== 0 && sgn !== dir) {
      legs.push(travelled);
      travelled = 0;
    }
    dir = sgn;
    travelled += Math.abs(d);
  }
  legs.push(travelled);
  const real = legs.filter((l) => l > 25);
  if (real.length > 2)
    failures.push(
      `${label}: card travelled ${real.length} separate legs (${real.map((l) => l.toFixed(0)).join(", ")}px) — it retraced its arc instead of one trip out and back`,
    );
  else
    note(
      `${label}: one clean arc (out ${real[0]?.toFixed(0) ?? 0}px, back ${real[1]?.toFixed(0) ?? 0}px)`,
    );
  await page.close();
}

await browser.close();

if (failures.length) {
  console.error("FAIL\n  " + failures.join("\n  "));
  process.exit(1);
}
console.log("PASS: settles on load, front card upright, cards go around the stack, fling is local, nothing see-through");
