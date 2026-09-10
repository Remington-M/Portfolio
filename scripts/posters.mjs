#!/usr/bin/env node
/**
 * Draw one still per project, from the clip its deck card plays.
 *
 * Only the front card and its two neighbours are given a real <video> — six
 * autoplaying clips will not hold frame rate on a phone — so the rest of the
 * stack has nothing to show. Without a still they fall back to the flat empty
 * colour, which is dark: a card two places back rendered darker than the one
 * behind it, and the stack stopped reading as ordered by depth at all.
 *
 * The still is set on the <video> as well, so a live card shows the picture
 * from the first frame rather than the empty colour while it decodes.
 *
 * JPEG rather than WebP, which would be about a third the size: the ffmpeg on
 * this machine is built without libwebp, and a poster is not worth making the
 * toolchain a prerequisite over. At this size the difference is a few tens of
 * kilobytes across the whole set.
 *
 *   node scripts/posters.mjs
 */
import { execFile } from "node:child_process";
import { readFile, writeFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = await readFile(join(REPO, "lib/projects.ts"), "utf8");

/**
 * Wide enough for the card at 2x and no wider.
 *
 * The deck card is around 400 points across, and this is a still nobody looks
 * at closely — it is what a card two places back is wearing.
 */
const WIDTH = 800;
/** Where in the clip to take it from. Far enough in to be past a fade-up. */
const AT = 0.45;

const marks = [...source.matchAll(/slug: "([a-z0-9-]+)",/g)].map((m) => ({
  slug: m[1],
  at: m.index,
}));

let wrote = 0;
for (const [i, mark] of marks.entries()) {
  const end = i + 1 < marks.length ? marks[i + 1].at : source.length;
  const text = source.slice(mark.at, end);
  const head = text.slice(0, text.indexOf("shots:"));
  const hero = head.match(/src: "(\/media\/[^"]+)"/)?.[1];
  if (!hero) {
    console.log(`  ${mark.slug.padEnd(24)} no hero clip, skipped`);
    continue;
  }

  const clip = join(REPO, "public", hero);
  /**
   * Beside the clip it was taken from, not in a folder named for the project.
   *
   * The listing editor's media still lives under `mys`, so a path built from
   * the slug pointed at a directory that does not exist. Following the clip
   * keeps a project's media in one place whatever that place is called.
   */
  const out = `${hero.slice(0, hero.lastIndexOf("/"))}/poster.jpg`;
  const outFile = join(REPO, "public", out);

  const { stdout } = await run("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", clip,
  ]);
  const at = (Number(stdout.trim()) || 1) * AT;

  await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-ss", String(at), "-i", clip, "-frames:v", "1",
    "-vf", `scale=${WIDTH}:-2`,
    // -q:v 3 is near the top of mjpeg's quality range. These are flat UI
    // screens, where ringing around type shows up far more readily than it
    // would on a photograph.
    "-c:v", "mjpeg", "-q:v", "4",
    outFile,
  ]);

  const size = (await stat(outFile)).size;
  console.log(
    `  ${mark.slug.padEnd(24)} ${out}  ${(size / 1024).toFixed(0)}KB  ` +
      `from ${hero.replace("/media/", "")} @ ${at.toFixed(1)}s`,
  );
  wrote += 1;
}

console.log(`\n${wrote} posters written.`);
