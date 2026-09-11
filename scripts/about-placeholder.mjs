/**
 * Draws the placeholder portrait for the About page's Polaroid.
 *
 * There is no real photo yet, and the development shader needs a picture
 * with a full range of tones to show what it does — deep shadow, a bright
 * sky, warm and cool colour. A coastal evening has all of it. Rendered in
 * headless Chromium so no image library is needed here.
 *
 *   node scripts/about-placeholder.mjs
 *
 * Replace `public/about/portrait.jpg` with a real photo and this script is
 * no longer needed.
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const html = `<canvas id="c" width="960" height="960"></canvas><script>
const c = document.getElementById("c"), x = c.getContext("2d"), W = 960, H = 960;
const sky = x.createLinearGradient(0, 0, 0, H * 0.62);
sky.addColorStop(0, "#1d2f5e"); sky.addColorStop(0.45, "#5b6fa8");
sky.addColorStop(0.8, "#d9905f"); sky.addColorStop(1, "#f3c98a");
x.fillStyle = sky; x.fillRect(0, 0, W, H);
const sun = x.createRadialGradient(W*0.62, H*0.58, 0, W*0.62, H*0.58, W*0.34);
sun.addColorStop(0, "rgba(255,238,200,0.95)"); sun.addColorStop(0.18, "rgba(255,210,150,0.55)");
sun.addColorStop(1, "rgba(255,180,120,0)");
x.fillStyle = sun; x.fillRect(0, 0, W, H);
// hills
for (let i = 0; i < 3; i++) {
  const y0 = H * (0.5 + i * 0.05), c1 = ["#6b5a7a","#4a4360","#2e2b3f"][i];
  x.fillStyle = c1; x.beginPath(); x.moveTo(0, H);
  for (let px = 0; px <= W; px += 8) {
    const y = y0 + Math.sin(px / (140 - i*30) + i) * 22 + Math.sin(px / 37 + i*2) * 7 - i*10;
    x.lineTo(px, y);
  }
  x.lineTo(W, H); x.closePath(); x.globalAlpha = 0.85 + i*0.05; x.fill(); x.globalAlpha = 1;
}
// water
const water = x.createLinearGradient(0, H*0.66, 0, H);
water.addColorStop(0, "#c98a5c"); water.addColorStop(0.3, "#5d5a7d"); water.addColorStop(1, "#171a2a");
x.fillStyle = water; x.fillRect(0, H*0.66, W, H*0.34);
for (let i = 0; i < 260; i++) {
  const y = H*0.66 + Math.pow(Math.random(), 1.6) * H*0.3;
  const w = 20 + Math.random()*120*(y-H*0.6)/(H*0.4);
  const cx = W*0.62 + (Math.random()-0.5) * (y-H*0.6) * 1.6;
  x.fillStyle = "rgba(255,220,170," + (0.12 + Math.random()*0.25) + ")";
  x.fillRect(cx - w/2, y, w, 1.5 + Math.random()*2);
}
// foreground rocks
x.fillStyle = "#0c0d14";
x.beginPath(); x.moveTo(0, H); x.lineTo(0, H*0.82);
x.quadraticCurveTo(W*0.12, H*0.74, W*0.3, H*0.86);
x.quadraticCurveTo(W*0.42, H*0.93, W*0.5, H); x.closePath(); x.fill();
x.beginPath(); x.moveTo(W, H); x.lineTo(W, H*0.9);
x.quadraticCurveTo(W*0.9, H*0.86, W*0.78, H*0.95); x.quadraticCurveTo(W*0.7, H, W*0.7, H);
x.closePath(); x.fill();
// a figure, small, on the rocks
x.fillStyle = "#0a0a10";
x.beginPath(); x.ellipse(W*0.22, H*0.72, 11, 13, 0, 0, Math.PI*2); x.fill();
x.beginPath(); x.moveTo(W*0.22-14, H*0.79); x.quadraticCurveTo(W*0.22, H*0.70, W*0.22+14, H*0.79);
x.lineTo(W*0.22+9, H*0.85); x.lineTo(W*0.22-9, H*0.85); x.closePath(); x.fill();
// grain
const id = x.getImageData(0,0,W,H), d = id.data;
for (let i = 0; i < d.length; i += 4) { const n = (Math.random()-0.5)*14; d[i]+=n; d[i+1]+=n; d[i+2]+=n; }
x.putImageData(id, 0, 0);
</script>`;

const CHROME = process.env.CHROME_PATH;
const browser = await chromium.launch({
  ...(CHROME ? { executablePath: CHROME } : {}),
});
const page = await browser.newPage();
await page.setContent(html);
const data = await page.evaluate(() =>
  document.getElementById("c").toDataURL("image/jpeg", 0.86),
);
await browser.close();
writeFileSync(
  new URL("../public/about/portrait.jpg", import.meta.url),
  Buffer.from(data.split(",")[1], "base64"),
);
console.log("wrote public/about/portrait.jpg");
