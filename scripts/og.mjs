#!/usr/bin/env node
/**
 * Render the Open Graph card — the image that shows up when the site's link is
 * pasted into LinkedIn, Slack, iMessage or a tweet.
 *
 *   node scripts/og.mjs                 # writes public/og.jpg
 *   node scripts/og.mjs --open          # ...and leaves the HTML for inspection
 *
 * It is a Playwright screenshot of a page laid out here, rather than a file
 * exported from a design tool, for one reason: the card is set in the site's
 * own faces at the site's own sizes, read out of `lib/design.ts`, so it cannot
 * drift away from the page it is advertising. Change the hero and re-run.
 *
 * The output is committed. This is a manual step, not part of the build — a
 * link preview does not need to be regenerated on every deploy, and keeping it
 * out of CI means the deploy has no browser dependency.
 */
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { chromium } from "playwright";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "og.jpg");

/**
 * 1200x630 is the ratio every scraper agrees on; rendering at 2x and letting
 * the JPEG carry it means the card stays sharp where a platform shows it on a
 * retina display, and every platform downsamples to taste anyway.
 */
const WIDTH = 1200;
const HEIGHT = 630;
const SCALE = 2;
const QUALITY = 88;

/** What the card says. The sentence is the hero's, verbatim. */
const SENTENCE = [
  "Hey, I’m Remington and I make",
  "software come to life with ",
];
const LAST_WORD = "motion.";
const EYEBROW = "Remington McElhaney";
const PLACE = "San Francisco";
const CREDIT = "Airbnb · Google";
const DOMAIN = process.env.OG_DOMAIN ?? "remingtonm.com";

/* Tokens lifted from app/globals.css and lib/design.ts. */
const PAGE = "oklch(0.963 0.008 80)";
const INK = "oklch(0.18 0.006 60)";
const INK_3 = "oklch(0.56 0.008 60)";
const RULE = "oklch(0.18 0.006 60 / 0.14)";

/**
 * Inline a font file as a data URI.
 *
 * Everything the page needs has to be embedded: the screenshot is taken off a
 * `data:` URL with no server behind it, so a relative `url(/fonts/...)` would
 * resolve to nothing and the card would silently come out in Times.
 */
async function dataUri(path) {
  const buf = await readFile(path);
  return `data:font/woff2;base64,${buf.toString("base64")}`;
}

/**
 * IBM Plex Mono, latin subset, straight from Google — the same file
 * `next/font` would fetch at build time.
 *
 * Fetched rather than vendored because it is needed for this one manual step
 * and nothing else; a miss falls back to the platform monospace, which changes
 * the two small meta lines and nothing structural.
 */
async function plexMono() {
  const ua =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  try {
    const css = await fetch(
      "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&display=swap",
      { headers: { "User-Agent": ua }, signal: AbortSignal.timeout(20000) },
    ).then((r) => r.text());

    /* The last @font-face of each weight is the latin subset. */
    const faces = css.split("@font-face").slice(1);
    const out = [];
    for (const weight of ["400", "500"]) {
      const latin = faces
        .filter((f) => f.includes(`font-weight: ${weight}`))
        .at(-1);
      const url = latin?.match(/url\((https:[^)]+\.woff2)\)/)?.[1];
      if (!url) continue;
      const buf = Buffer.from(
        await fetch(url, { signal: AbortSignal.timeout(20000) }).then((r) =>
          r.arrayBuffer(),
        ),
      );
      out.push(
        `@font-face{font-family:"Plex";font-weight:${weight};font-style:normal;` +
          `src:url(data:font/woff2;base64,${buf.toString("base64")}) format("woff2")}`,
      );
    }
    if (out.length) return out.join("\n");
  } catch {
    /* fall through */
  }
  console.warn("  ! IBM Plex Mono unavailable — meta lines use the fallback.");
  return "";
}

async function html() {
  const [buch, kraftig, mono] = await Promise.all([
    dataUri(join(ROOT, "public", "fonts", "soehne-buch.woff2")),
    dataUri(join(ROOT, "public", "fonts", "soehne-kraftig.woff2")),
    plexMono(),
  ]);

  return `<!doctype html>
<meta charset="utf-8">
<style>
  @font-face{font-family:"Soehne";font-weight:400;font-style:normal;src:url(${buch}) format("woff2")}
  @font-face{font-family:"Soehne";font-weight:500;font-style:normal;src:url(${kraftig}) format("woff2")}
  ${mono}
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:${WIDTH}px;height:${HEIGHT}px}
  body{
    background:${PAGE};
    color:${INK};
    font-family:"Soehne",system-ui,sans-serif;
    -webkit-font-smoothing:antialiased;
    text-rendering:optimizeLegibility;
    display:flex;
    flex-direction:column;
    justify-content:space-between;
    padding:74px 78px;
  }
  /* The site's label role: mono, uppercase, wide. globals.css sets it at 11px. */
  .meta{
    font-family:"Plex",ui-monospace,monospace;
    font-size:17px;
    font-weight:500;
    letter-spacing:.1em;
    text-transform:uppercase;
    color:${INK_3};
    display:flex;
    justify-content:space-between;
    align-items:baseline;
  }
  /* TYPE.hero, scaled to the card: 400, -0.025em, 1.18. */
  h1{
    font-size:64px;
    font-weight:400;
    line-height:1.16;
    letter-spacing:-0.025em;
    max-width:1000px;
    text-wrap:pretty;
  }
  /*
   * On the site "motion" is the word that reacts to a cursor. It cannot do
   * that here, so it takes the only other emphasis the licence allows: the
   * second and last weight.
   */
  .beat{font-weight:500}
  .rule{border-top:1px solid ${RULE};padding-top:22px}
</style>
<div class="meta"><span>${EYEBROW}</span><span>${PLACE}</span></div>
<h1>${SENTENCE[0]}<br>${SENTENCE[1]}<span class="beat">${LAST_WORD}</span></h1>
<div class="meta rule"><span>${CREDIT}</span><span>${DOMAIN}</span></div>
`;
}

const page = await html();

if (process.argv.includes("--open")) {
  const debug = join(ROOT, "public", "og-preview.html");
  await writeFile(debug, page);
  console.log(`  preview → ${debug}`);
}

/* Same escape hatch the verify scripts use, for a pinned or sandboxed build. */
const CHROME = process.env.CHROME_PATH;
const browser = await chromium.launch({
  ...(CHROME ? { executablePath: CHROME } : {}),
});
const ctx = await browser.newContext({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: SCALE,
});
const tab = await ctx.newPage();
await tab.setContent(page, { waitUntil: "load" });
await tab.evaluate(() => document.fonts.ready);
await mkdir(dirname(OUT), { recursive: true });
await tab.screenshot({ path: OUT, type: "jpeg", quality: QUALITY });
await browser.close();

const { size } = await import("node:fs/promises").then((fs) => fs.stat(OUT));
console.log(
  `  og.jpg → ${WIDTH * SCALE}x${HEIGHT * SCALE}, ${(size / 1024).toFixed(0)} KB`,
);
