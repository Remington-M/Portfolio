#!/usr/bin/env node
/**
 * Turn a photo of handwriting into the ink alone, as white on transparent,
 * for the back of the About page's Polaroid.
 *
 *   node scripts/about-back.mjs [--rotate ccw|cw|180]
 *
 * Reads  media-source/about/back.jpg  (a phone photo of marker on paper)
 * Writes public/about/back.png        (the strokes, white, alpha = ink)
 *
 * The photo can be lit unevenly and it does not matter: each pixel is judged
 * against the paper around it rather than against one threshold, so a shadow
 * across the sheet is not read as ink. The result is cropped to the writing
 * with a little air around it, and the site sizes it to the print from there.
 *
 * ffmpeg does the decoding and encoding, as it does for every clip; the mask
 * itself is a few lines of typed-array arithmetic, so there is no image
 * library to install.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = ["jpg", "jpeg", "png", "heic"]
  .map((ext) => join(REPO, `media-source/about/back.${ext}`))
  .find(existsSync);
const OUT = join(REPO, "public/about/back.png");

if (!SRC) {
  console.error("Put the photo at media-source/about/back.jpg and run again.");
  process.exit(1);
}

const args = process.argv.slice(2);
const rotate = args[args.indexOf("--rotate") + 1];
const transpose =
  { ccw: "transpose=2,", cw: "transpose=1,", 180: "transpose=1,transpose=1," }[rotate] ?? "";

/** Longest side of the working image. Plenty for a print a few hundred px wide. */
const MAX = 2000;

// 1. Decode to 8-bit grey, rotated, no larger than MAX on its long side.
const probe = spawnSync(
  "ffprobe",
  ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
   "-of", "csv=p=0", SRC],
  { encoding: "utf8" },
);
if (probe.status !== 0) { console.error(probe.stderr); process.exit(1); }
let [w, h] = probe.stdout.trim().split(",").map(Number);
if (rotate === "ccw" || rotate === "cw") [w, h] = [h, w];
const k = Math.min(1, MAX / Math.max(w, h));
const W = Math.round(w * k) & ~1;
const H = Math.round(h * k) & ~1;

const dec = spawnSync(
  "ffmpeg",
  ["-v", "error", "-i", SRC, "-vf", `${transpose}scale=${W}:${H}`,
   "-pix_fmt", "gray", "-f", "rawvideo", "-"],
  { maxBuffer: 1 << 28 },
);
if (dec.status !== 0) { console.error(dec.stderr.toString()); process.exit(1); }
const grey = new Uint8Array(dec.stdout.buffer, dec.stdout.byteOffset, W * H);

// 2. The paper: a wide box blur of the grey, computed with a summed-area
//    table so the window can be as wide as it likes at no extra cost. Ink is
//    thin against the paper, so a window of ~4% of the width barely sees it.
const R = Math.round(Math.max(W, H) * 0.04);
const sat = new Float64Array((W + 1) * (H + 1));
for (let y = 1; y <= H; y++) {
  let row = 0;
  for (let x = 1; x <= W; x++) {
    row += grey[(y - 1) * W + (x - 1)];
    sat[y * (W + 1) + x] = sat[(y - 1) * (W + 1) + x] + row;
  }
}
const mean = (x0, y0, x1, y1) => {
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W, x1); y1 = Math.min(H, y1);
  const S = (x, y) => sat[y * (W + 1) + x];
  return (S(x1, y1) - S(x0, y1) - S(x1, y0) + S(x0, y0)) / ((x1 - x0) * (y1 - y0));
};

// 3. Ink = how far below the local paper a pixel falls, as a fraction of the
//    paper's brightness. Marker is 60%+ darker; grain and shadow gradients
//    are a few percent. The ramp between keeps the stroke edges soft.
const LO = 0.18, HI = 0.5;
const alpha = new Uint8Array(W * H);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const paper = mean(x - R, y - R, x + R + 1, y + R + 1);
    const drop = (paper - grey[y * W + x]) / Math.max(paper, 1);
    const t = Math.min(1, Math.max(0, (drop - LO) / (HI - LO)));
    alpha[y * W + x] = Math.round(t * t * (3 - 2 * t) * 255);
  }
}

// 4. Level each line of writing. A hand writes each line at its own tilt,
//    and this one had the date leaning a few degrees off the place name. The
//    lines are found as bands of rows that carry ink; each band's tilt is the
//    long axis of its ink, and the band is turned about its centre to lie
//    flat. Lines within a degree of level are left as written.
const rows = new Uint8Array(H);
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++)
    if (alpha[y * W + x] > 40) { rows[y] = 1; break; }
const bands = [];
for (let y = 0; y < H; y++) {
  if (!rows[y]) continue;
  let end = y;
  // A gap shorter than 2% of the height is the space between a letter's
  // parts, not between lines.
  while (end < H && (rows[end] || rows.slice(end, end + Math.round(H * 0.02)).some(Boolean))) end++;
  bands.push([y, end]);
  y = end;
}
const levelled = new Uint8Array(W * H);
for (const [top, bottom] of bands) {
  let n = 0, sx = 0, sy = 0;
  for (let y = top; y < bottom; y++)
    for (let x = 0; x < W; x++) {
      const a = alpha[y * W + x];
      if (a > 40) { n++; sx += x; sy += y; }
    }
  const cx = sx / n, cy = sy / n;
  let vxx = 0, vyy = 0, vxy = 0;
  for (let y = top; y < bottom; y++)
    for (let x = 0; x < W; x++)
      if (alpha[y * W + x] > 40) {
        vxx += (x - cx) ** 2; vyy += (y - cy) ** 2; vxy += (x - cx) * (y - cy);
      }
  let angle = 0.5 * Math.atan2(2 * vxy, vxx - vyy);
  if (Math.abs(angle) < (Math.PI / 180)) angle = 0;
  const c = Math.cos(angle), s = Math.sin(angle);
  console.log(`line at y=${Math.round(cy)}: ${(angle * 180 / Math.PI).toFixed(1)}°`);
  // Inverse-map every output pixel near the band back into the tilted
  // source, sampling bilinearly so the edges stay soft.
  const reach = Math.round((bottom - top) * 0.6 + W * Math.abs(s));
  for (let y = Math.max(0, top - reach); y < Math.min(H, bottom + reach); y++)
    for (let x = 0; x < W; x++) {
      const dx = x - cx, dy = y - cy;
      const u = cx + dx * c - dy * s, v = cy + dx * s + dy * c;
      if (v < top - 2 || v >= bottom + 2 || u < 0 || u >= W - 1) continue;
      const x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0;
      const at = (xx, yy) => (yy >= 0 && yy < H ? alpha[yy * W + xx] : 0);
      const a =
        at(x0, y0) * (1 - fx) * (1 - fy) + at(x0 + 1, y0) * fx * (1 - fy) +
        at(x0, y0 + 1) * (1 - fx) * fy + at(x0 + 1, y0 + 1) * fx * fy;
      const o = y * W + x;
      if (a > levelled[o]) levelled[o] = Math.round(a);
    }
}
alpha.set(levelled);

// 5. Crop to the ink, with air around it.
let x0 = W, y0 = H, x1 = 0, y1 = 0;
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++)
    if (alpha[y * W + x] > 40) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
if (x1 < x0) { console.error("No ink found."); process.exit(1); }
const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.06);
x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
const CW = (x1 - x0 + 1) & ~1, CH = (y1 - y0 + 1) & ~1;

const rgba = new Uint8Array(CW * CH * 4);
for (let y = 0; y < CH; y++)
  for (let x = 0; x < CW; x++) {
    const o = (y * CW + x) * 4;
    rgba[o] = rgba[o + 1] = rgba[o + 2] = 255;
    rgba[o + 3] = alpha[(y0 + y) * W + (x0 + x)];
  }

// 6. Encode.
const enc = spawnSync(
  "ffmpeg",
  ["-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${CW}x${CH}`,
   "-i", "-", "-frames:v", "1", OUT],
  { input: rgba, maxBuffer: 1 << 28 },
);
if (enc.status !== 0) { console.error(enc.stderr.toString()); process.exit(1); }
console.log(`Wrote public/about/back.png  ${CW}×${CH}  (aspect ${(CW / CH).toFixed(3)})`);
