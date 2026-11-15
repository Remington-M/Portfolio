/**
 * Regression test for the phone layout.
 *
 * The other verify scripts all run at 1440x900, and three faults shipped to
 * phones underneath them: titles drawn over the card on a short screen, the
 * header and counter pushed off the edges of one, and the return card hidden
 * behind its own ghost fan. Each is a thing a desktop run cannot see, so this
 * walks the same pages at phone sizes — including the short ones a browser
 * with its toolbars showing actually gives a page — and checks them.
 *
 *   node scripts/verify-phone.mjs [baseUrl]
 *
 * Requires a running server (`npm run dev`, or `npm run build && npm start`).
 */
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:3000";
const CHROME = process.env.CHROME_PATH;
const SLUG = "airbnb-reservations";

/** Width x height: an old SE, an SE in Safari, a 14 in Safari, a 14, a Max. */
const SIZES = [
  [320, 568],
  [375, 553],
  [390, 664],
  [390, 844],
  [430, 932],
];

const browser = await chromium.launch({
  ...(CHROME ? { executablePath: CHROME } : {}),
  args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"],
});

const failures = [];
const fail = (size, what) => failures.push(`${size.join("x")}: ${what}`);

for (const size of SIZES) {
  const [width, height] = size;
  const ctx = await browser.newContext({
    viewport: { width, height },
    hasTouch: true,
    isMobile: true,
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fail(size, `page error: ${e.message}`));

  await page.goto(`${BASE}/work/${SLUG}`, { waitUntil: "load" });
  await page.waitForSelector("[data-viewer]");
  await page.waitForTimeout(1500);

  const scroller = ".no-scrollbar";
  const count = await page.evaluate(
    (sel) => Math.round((document.querySelector(sel).scrollHeight - 200 - 1000) / 780),
    scroller,
  );

  for (let shot = 0; shot < count; shot++) {
    await page.evaluate(
      ([sel, top]) => document.querySelector(sel).scrollTo({ top, behavior: "instant" }),
      [scroller, 200 + shot * 780],
    );
    await page.waitForTimeout(1300);
    const m = await page.evaluate(() => {
      const box = (el) => el?.getBoundingClientRect();
      const viewer = box(document.querySelector("[data-viewer]"));
      const title = box(document.querySelector('[data-shot-title="on"]')?.firstElementChild);
      const back = box(document.querySelector("header a"));
      const next = box(document.querySelector('button[aria-label="Next shot"], button[aria-label="Return to work"]'));
      return { viewer, title, back, next, vw: innerWidth, vh: innerHeight };
    });
    const at = `shot ${shot + 1}`;
    if (!m.viewer || !m.title || !m.back || !m.next) {
      fail(size, `${at}: viewer, caption, back link or next arrow missing`);
      continue;
    }
    if (m.title.top < m.viewer.bottom)
      fail(size, `${at}: caption (top ${m.title.top.toFixed(0)}) is over the viewer (bottom ${m.viewer.bottom.toFixed(0)})`);
    if (m.viewer.top < m.back.bottom)
      fail(size, `${at}: viewer runs under the back link`);
    if (m.viewer.left < 0 || m.viewer.right > m.vw)
      fail(size, `${at}: viewer is wider than the screen`);
    if (m.back.top < 0) fail(size, `${at}: back link is off the top`);
    if (m.next.bottom > m.vh + 0.5 || m.next.top < m.title.bottom - 0.5)
      fail(size, `${at}: next arrow is off the bottom or over the caption`);
  }

  // The return ending: the fan must be BEHIND the card, which on a phone
  // means outside the scroller that sits above the card layer.
  await page.evaluate(
    (sel) => {
      const el = document.querySelector(sel);
      el.scrollTo({ top: el.scrollHeight, behavior: "instant" });
    },
    scroller,
  );
  await page.waitForTimeout(1500);
  const ending = await page.evaluate((sel) => {
    const fan = document.querySelector("[data-ghost-fan]");
    return { fan: !!fan, covered: !!fan && !!fan.closest(sel) };
  }, scroller);
  if (!ending.fan) fail(size, "ending: the ghost fan never appeared");
  if (ending.covered) fail(size, "ending: the ghost fan is drawn over the return card");

  // Home, with the deck seated: the title under the card clears it.
  await page.goto(BASE, { waitUntil: "load" });
  await page
    .waitForFunction((sel) => getComputedStyle(document.querySelector(sel)).overflowY === "auto", scroller, { timeout: 20000 })
    .catch(() => fail(size, "home: the deck never became scrollable"));
  await page.evaluate(
    (sel) => {
      const el = document.querySelector(sel);
      el.scrollTo({ top: el.clientHeight * 1.5, behavior: "instant" });
    },
    scroller,
  );
  await page.waitForTimeout(2500);
  const home = await page.evaluate(() => {
    // The front card is the one carrying the link into its project.
    const card = document.querySelector("[data-deck-layer] a")?.parentElement?.getBoundingClientRect();
    const ticks = document.querySelector('button[aria-current="true"]');
    const title = ticks?.parentElement?.parentElement?.parentElement?.firstElementChild?.getBoundingClientRect();
    const nav = document.querySelector("header nav")?.getBoundingClientRect();
    return { card, title, nav };
  });
  if (!home.card || !home.title || !home.nav) fail(size, "home: card, title or nav missing");
  else {
    if (home.title.top < home.card.bottom)
      fail(size, `home: title (top ${home.title.top.toFixed(0)}) is over the card (bottom ${home.card.bottom.toFixed(0)})`);
    if (home.nav.top < 0) fail(size, "home: nav is off the top");
  }

  await ctx.close();
}

await browser.close();

if (failures.length) {
  console.error(failures.map((f) => `FAIL: ${f}`).join("\n"));
  process.exit(1);
}
console.log(`PASS: phone layout holds at ${SIZES.map((s) => s.join("x")).join(", ")}`);
