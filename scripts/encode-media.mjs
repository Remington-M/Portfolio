#!/usr/bin/env node
/**
 * Turn the raw exports in `media-source/` into the clips the site serves.
 *
 * `media-source/<slug>/<name>.mp4` becomes `public/media/<slug>/<name>.mp4`.
 * The mirror is one-to-one and the names carry across untouched, so the file a
 * shot points at is always the source of the same name — no lookup table to
 * drift, and re-exporting a clip is a matter of dropping it in and re-running.
 *
 *   node scripts/encode-media.mjs            # everything out of date
 *   node scripts/encode-media.mjs --force    # everything, again
 *   node scripts/encode-media.mjs google-pixel
 *
 * The settings below are not new. They were read back out of the `mys/` clips
 * that were already on the site — `strings` on an MP4 prints the x264 options
 * it was built with — so the projects that land now match the one that shipped
 * first rather than starting a second house style. Re-encoding those sources
 * through this script reproduces eight of the thirteen byte for byte, and the
 * five it does not are the longest ones, where x264's frame threading is not
 * deterministic across runs; those match in every frame and land within 0.05%
 * on size. So the recipe here is the original recipe, not an approximation.
 */
import { execFile } from "node:child_process";
import { mkdir, readdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "media-source");
const OUT = join(ROOT, "public", "media");

/**
 * The longest side any clip is allowed to have.
 *
 * These are screen recordings played inside a viewer that is at most ~1020
 * points wide, so the 4320-wide exports carry four times the pixels anyone can
 * see. 1920 is generous enough for a 2x display and is where the existing
 * clips already sit.
 */
const MAX_SIDE = 1920;

/**
 * Quality, and the ceiling that stops one busy clip from spiking.
 *
 * CRF 21 rather than a target bitrate: the footage ranges from flat UI that
 * compresses to nothing to photo grids that do not, and a fixed rate would
 * either starve the second or waste bytes on the first. `maxrate`/`bufsize`
 * then cap the peak so a single shot cannot stall a first play.
 */
const CRF = 21;
const MAXRATE = "7M";
const BUFSIZE = "14M";

/**
 * Fit inside MAX_SIDE without upscaling, keeping both sides even.
 *
 * `decrease` means the box is a ceiling rather than a target, so a clip already
 * smaller than it is left at its own size — re-encoding a 1000x1000 render up
 * to 1920 would invent detail and cost bytes to store it. Both sides have to
 * stay even for yuv420p chroma siting.
 */
const SCALE =
  `scale=w=min(${MAX_SIDE}\\,iw):h=min(${MAX_SIDE}\\,ih)` +
  `:force_original_aspect_ratio=decrease:force_divisible_by=2`;

/**
 * Clips that were exported inside a device frame, and where the screen is
 * in them: `w:h:x:y` in source pixels, applied before the scale.
 *
 * The gesture navigation recordings were comped into a Pixel 4 on white and
 * the originals are gone. The viewer draws no device frames — a bezel is a
 * second subject — so these are cropped to the screen, whose position never
 * moves in the comp. The rectangle was measured off the bezel in
 * `back.mp4`, where the screen is white edge to edge: 1146 × 2414 at
 * (146, 352) in the 1440 × 3040 export, brought to even sizes. The
 * screen's own rounded corners come along with it — 87px on the source,
 * 0.076 of the screen's width — and the `pixel` shot kind in design.ts
 * gives the viewer the same corner radius so the two coincide.
 */
const CROP = {
  /**
   * This one is also cropped INSIDE the screen: the Maps recording carries
   * opaque black status and gesture bars, 54px and 52px on the source, and
   * the launcher under them is as dark, so they read as bezel. Taken off,
   * 1146 × 2308 at (146, 406). The screen's corner arcs are 87px, so what
   * survives of them is a 6px sliver at each edge that the viewer's own
   * rounding hides; the shot's aspect is 0.4965 to match.
   */
  "gesture-navigation/swipe-to-go-home.mp4": "1146:2308:146:406",
  "gesture-navigation/overview.mp4": "1146:2414:146:352",
  "gesture-navigation/back.mp4": "1146:2414:146:352",
  /**
   * The assistant clip is NOT cropped. It carries a thin black border —
   * 14px each side, 33 top and 30 bottom on the source — and the gesture's
   * light runs along the very edge of the screen and round its bottom
   * corners. Cropped to the screen, the viewer's rounding sat exactly on
   * that light and cut it; with the border kept, the light sits inside the
   * viewer's edge and the border reads as a hairline of bezel. Only the
   * top and bottom are trimmed, down to the 14px the sides have, so the
   * border is even all round.
   */
  "gesture-navigation/assistant-gesture.mp4": "1440:3004:0:19",
};

function args(src, dst, crop) {
  return [
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", src,
    // Video only. The exports carry an AAC track of room tone or nothing at
    // all, and every clip on the site is a muted autoplaying loop, so the
    // audio is bytes nobody can hear. `-dn`/`-sn` drop the timecode and
    // subtitle tracks the screen recorders leave behind.
    "-map", "0:v:0", "-an", "-sn", "-dn",
    "-vf", crop ? `crop=${crop},${SCALE}` : SCALE,
    "-c:v", "libx264",
    // High profile and yuv420p: the combination every browser decodes in
    // hardware. 4:4:4 or 10-bit would look marginally better on the flat UI
    // and would fall back to software decoding, or fail, on much of the web.
    "-profile:v", "high", "-pix_fmt", "yuv420p",
    "-preset", "slow", "-crf", String(CRF),
    "-maxrate", MAXRATE, "-bufsize", BUFSIZE,
    // The moov atom belongs at the front. Without this the browser has to
    // fetch the end of the file before it can show frame one, which on a page
    // that autoplays a clip the moment it scrolls in is the whole delay.
    "-movflags", "+faststart",
    dst,
  ];
}

async function probe(file) {
  const { stdout } = await run("ffprobe", [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height", "-show_entries", "format=duration,size",
    "-of", "default=nw=1", file,
  ]);
  const get = (k) => stdout.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1];
  return {
    w: +get("width"), h: +get("height"),
    duration: +get("duration"), size: +get("size"),
  };
}

async function mtime(file) {
  try {
    return (await stat(file)).mtimeMs;
  } catch {
    return -1;
  }
}

const argv = process.argv.slice(2);
const force = argv.includes("--force");
const only = argv.filter((a) => !a.startsWith("--"));

const slugs = (await readdir(SOURCE, { withFileTypes: true }))
  .filter((e) => e.isDirectory() && (only.length === 0 || only.includes(e.name)))
  .map((e) => e.name)
  .sort();

if (slugs.length === 0) {
  console.error(only.length ? `No such project in media-source: ${only.join(", ")}` : "media-source is empty.");
  process.exit(1);
}

let encoded = 0;
let skipped = 0;

for (const slug of slugs) {
  const from = join(SOURCE, slug);
  const to = join(OUT, slug);
  await mkdir(to, { recursive: true });

  // A leading underscore holds a source back. Alternate takes get kept next to
  // the one that shipped — losing the other cut of a clip to tidiness is worse
  // than carrying a file nobody encodes — and without this the mirror would
  // faithfully publish every one of them.
  const clips = (await readdir(from))
    .filter((f) => f.endsWith(".mp4") && !f.startsWith("_"))
    .sort();
  console.log(`\n${slug}`);

  for (const clip of clips) {
    const src = join(from, clip);
    const dst = join(to, clip);

    if (!force && (await mtime(dst)) > (await mtime(src))) {
      skipped += 1;
      console.log(`  · ${clip} (up to date)`);
      continue;
    }

    const before = await probe(src);
    const crop = CROP[`${slug}/${clip}`];
    await run("ffmpeg", args(src, dst, crop), { maxBuffer: 1 << 24 });
    const after = await probe(dst);
    encoded += 1;

    const mb = (n) => (n / 1e6).toFixed(1);
    console.log(
      `  ✓ ${clip.padEnd(30)} ${before.w}x${before.h} -> ${after.w}x${after.h}` +
        (crop ? `  cropped ${crop}` : "") +
        `  ${mb(before.size)}MB -> ${mb(after.size)}MB` +
        `  aspect ${(after.w / after.h).toFixed(4)}`,
    );
  }
}

console.log(`\n${encoded} encoded, ${skipped} up to date.`);
