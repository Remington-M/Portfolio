#!/usr/bin/env node
/**
 * Generate public/order.html — a local, throwaway page for setting the shot
 * order of each project, which clip is its hero, and which are left out.
 *
 * The data is read out of lib/projects.ts and inlined, so the page always
 * opens on the state the site is actually in. Re-run it after applying an
 * order and it regenerates from the new one.
 *
 *   node scripts/order-ui.mjs   →   http://localhost:3000/order.html
 *
 * Neither this nor its output is committed. CI builds from a clean checkout,
 * so the page cannot reach the deployed site.
 */
import { readFile, writeFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = await readFile(join(REPO, "lib/projects.ts"), "utf8");

/** One chunk per project, so every match below is scoped to its own project. */
const marks = [...source.matchAll(/slug: "([a-z0-9-]+)",/g)].map((m) => ({
  slug: m[1],
  at: m.index,
}));

const projects = [];
for (const [i, mark] of marks.entries()) {
  const end = i + 1 < marks.length ? marks[i + 1].at : source.length;
  const text = source.slice(mark.at, end);
  const head = text.slice(0, text.indexOf("shots:"));

  const shots = [];
  const re =
    /\{\s*n: "(\d+)",\s*title: "([^"]+)",\s*kind: "([a-z]+)",\s*src: "([^"]+)",\s*aspect: ([0-9.]+),(\s*cut: true,)?/g;
  let s;
  while ((s = re.exec(text))) {
    shots.push({
      title: s[2],
      kind: s[3],
      src: s[4],
      aspect: Number(s[5]),
      cut: !!s[6],
    });
  }

  const project = {
    slug: mark.slug,
    title: head.match(/\n\s*title: "([^"]+)",/)?.[1] ?? mark.slug,
    year: head.match(/\n\s*year: "([^"]+)",/)?.[1] ?? "",
    hero: head.match(/src: "(\/media\/[^"]+)"/)?.[1] ?? null,
    shots,
    spare: [],
  };

  /**
   * Everything else sitting in the project's own media folder.
   *
   * A clip that is encoded but not in the gallery is invisible otherwise —
   * which is exactly what a hero is, and what a shot that has been taken out
   * becomes. Listing them makes both states something you can see and undo,
   * rather than a file nobody remembers.
   *
   * The folder is taken from the clips themselves rather than from the slug,
   * because the listing editor's still live under `mys`. The commonest folder
   * wins, so a clip borrowed from another project does not drag that whole
   * project's spares in with it.
   */
  const tally = new Map();
  for (const shot of shots) {
    const dir = shot.src.slice(0, shot.src.lastIndexOf("/"));
    tally.set(dir, (tally.get(dir) ?? 0) + 1);
  }
  const home = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (home) {
    const used = new Set(shots.map((x) => x.src));
    let files = [];
    try {
      files = await readdir(join(REPO, "public", home));
    } catch {}
    for (const file of files.filter((f) => f.endsWith(".mp4")).sort()) {
      const src = `${home}/${file}`;
      if (used.has(src)) continue;
      project.spare.push({ src, title: titleFrom(file), kind: "", aspect: "", cut: false });
    }
  }
  projects.push(project);
}

function titleFrom(file) {
  return file
    .replace(/\.mp4$/, "")
    .split("-")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

const total = projects.reduce((a, p) => a + p.shots.length, 0);
if (!projects.length || !total) {
  console.error("Parsed nothing — the shape of projects.ts must have changed.");
  process.exit(1);
}
for (const p of projects) {
  const dup = p.shots.some((s) => s.src === p.hero) ? "  hero is also a shot" : "";
  console.log(
    `  ${p.slug.padEnd(24)} ${String(p.shots.length).padStart(2)} shots, ` +
      `${p.spare.length} spare${dup}`,
  );
}
console.log(`  ${projects.length} projects, ${total} shots`);

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Shot order</title>
<style>
  :root{
    --page:#f4f2ee; --card:#fff; --ink:#14110d; --ink-2:#5d574e; --ink-3:#8d857a;
    --rule:#e2ddd4; --accent:#14110d; --drop:#c9e2d0; --cut:#c8a94a; --hero:#7a5cc4;
  }
  @media (prefers-color-scheme: dark){
    :root{ --page:#15130f; --card:#1e1b16; --ink:#f2efe9; --ink-2:#a9a196; --ink-3:#7a736a;
           --rule:#2e2a24; --accent:#f2efe9; --drop:#2b4736; --cut:#a98c33; --hero:#a48ce0; }
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--page);color:var(--ink);
       font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
  header{position:sticky;top:0;z-index:10;background:var(--page);
         border-bottom:1px solid var(--rule);padding:12px 20px;
         display:flex;gap:12px;align-items:center;flex-wrap:wrap}
  h1{font-size:15px;margin:0;font-weight:600;letter-spacing:-.01em}
  .spacer{flex:1}
  button{font:inherit;font-weight:500;border:1px solid var(--rule);background:var(--card);
         color:var(--ink);border-radius:8px;padding:7px 13px;cursor:pointer}
  button:hover{border-color:var(--ink-3)}
  button.primary{background:var(--accent);color:var(--page);border-color:var(--accent)}
  .hint{color:var(--ink-2);font-size:12.5px}
  main{padding:20px;display:grid;gap:26px;max-width:1180px;margin:0 auto}
  section{background:var(--card);border:1px solid var(--rule);border-radius:12px;overflow:hidden}
  .head{padding:12px 16px;border-bottom:1px solid var(--rule);display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
  .head h2{font-size:14px;margin:0;font-weight:600}
  .head .meta{color:var(--ink-3);font-size:12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
  .warn{color:var(--hero);font-size:12px;font-weight:500}
  .lab{padding:9px 16px 3px;font-size:11px;letter-spacing:.09em;text-transform:uppercase;
       color:var(--ink-3);font-weight:600}
  .lab span{text-transform:none;letter-spacing:0;font-weight:400}
  ul{list-style:none;margin:0;padding:6px 8px 10px;display:grid;gap:6px;min-height:52px}
  ul.spare{opacity:.72}
  li{display:grid;grid-template-columns:26px 104px 1fr auto;gap:12px;align-items:center;
     padding:7px;border:1px solid transparent;border-radius:9px;background:var(--page);
     cursor:grab;touch-action:none;user-select:none}
  li:hover{border-color:var(--rule)}
  li.dragging{opacity:.4;border-color:var(--ink-3);background:var(--drop);cursor:grabbing}
  li.iscut{box-shadow:inset 3px 0 0 var(--cut)}
  li.ishero{box-shadow:inset 3px 0 0 var(--hero)}
  li.iscut.ishero{box-shadow:inset 3px 0 0 var(--hero),inset 6px 0 0 var(--cut)}
  .idx{text-align:center;color:var(--ink-3);font-family:ui-monospace,Menlo,monospace;font-size:12px}
  .thumb{width:104px;height:66px;border-radius:6px;overflow:hidden;background:#0002;
         display:flex;align-items:center;justify-content:center}
  .thumb video{width:100%;height:100%;object-fit:contain;display:block;background:#0000}
  .body{min-width:0}
  .title{width:100%;font:inherit;font-weight:500;color:var(--ink);background:none;
         border:1px solid transparent;border-radius:6px;padding:3px 6px;margin:-3px -6px 1px}
  .title:hover{border-color:var(--rule)}
  .title:focus{outline:none;border-color:var(--ink-3);background:var(--card)}
  .file{color:var(--ink-3);font-size:11.5px;font-family:ui-monospace,Menlo,monospace;
        white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .tags{display:flex;gap:6px;align-items:center}
  .tag{font-size:11px;color:var(--ink-2);border:1px solid var(--rule);border-radius:5px;
       padding:2px 6px;font-family:ui-monospace,Menlo,monospace}
  .act{font-size:11.5px;color:var(--ink-2);border:1px solid var(--rule);border-radius:6px;
       padding:3px 8px;background:none;cursor:pointer;font-weight:500}
  .act:hover{border-color:var(--ink-3);color:var(--ink)}
  .act.on{background:var(--hero);border-color:var(--hero);color:#fff}
  label.cut{display:flex;gap:5px;align-items:center;font-size:11.5px;color:var(--ink-2);
            cursor:pointer;user-select:none}
  dialog{border:1px solid var(--rule);border-radius:12px;background:var(--card);color:var(--ink);
         padding:0;max-width:780px;width:92vw}
  dialog::backdrop{background:#0007}
  dialog .dhead{padding:12px 16px;border-bottom:1px solid var(--rule);display:flex;gap:10px;align-items:center}
  textarea{width:100%;height:52vh;border:0;padding:14px 16px;background:none;color:var(--ink);
           font:12px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;resize:none}
  textarea:focus{outline:none}
</style>
</head>
<body>
<header>
  <h1>Shot order</h1>
  <span class="hint">Drag to reorder, or between Gallery and Not shown. <b>Hero</b> marks the deck card &mdash; a hero should sit in Not shown.</span>
  <span class="spacer"></span>
  <button id="reset">Reset to file</button>
  <button id="copy" class="primary">Copy for Claude</button>
</header>
<main id="main"></main>

<dialog id="out">
  <div class="dhead"><strong>Paste this back into the chat</strong><span class="spacer"></span>
    <button id="copy2" class="primary">Copy</button><button id="close">Close</button></div>
  <textarea id="json" spellcheck="false" readonly></textarea>
</dialog>

<script>
const FILE = ${JSON.stringify(projects, null, 2)};
const KEY = "portfolio.shotorder.v2";

const clone = (v) => JSON.parse(JSON.stringify(v));
let state = load() ?? clone(FILE);

function load(){
  try{
    const raw = localStorage.getItem(KEY);
    if(!raw) return null;
    const saved = JSON.parse(raw);
    // Only trust it if it still covers exactly the clips the file knows about.
    const ids = (d) => d.flatMap(p => [...p.shots, ...p.spare].map(s => s.src)).sort().join("|");
    return ids(saved) === ids(FILE) ? saved : null;
  }catch{ return null; }
}
function save(){ try{ localStorage.setItem(KEY, JSON.stringify(state)); }catch{} }

const main = document.getElementById("main");
const findShot = (src) => {
  for(const p of state) for(const s of [...p.shots, ...p.spare]) if(s.src === src) return s;
  return null;
};

function render(){
  main.innerHTML = "";
  for(const p of state){
    const sec = document.createElement("section");
    sec.innerHTML =
      '<div class="head"><h2></h2><span class="meta"></span><span class="warn"></span></div>' +
      '<div class="lab">Gallery</div>' +
      '<ul data-slug="" data-list="shots"></ul>' +
      '<div class="lab">Not shown <span>&mdash; the hero, and anything held back</span></div>' +
      '<ul class="spare" data-slug="" data-list="spare"></ul>';
    sec.querySelector("h2").textContent = p.title;
    for(const ul of sec.querySelectorAll("ul")) ul.dataset.slug = p.slug;
    p.shots.forEach((s, i) => sec.querySelector('ul[data-list="shots"]').appendChild(row(p, s, i)));
    p.spare.forEach((s) => sec.querySelector('ul[data-list="spare"]').appendChild(row(p, s, -1)));
    main.appendChild(sec);
    meta(p);
  }
}

/** The counts line, and the one thing worth warning about. */
function meta(p){
  const sec = main.querySelector('ul[data-slug="' + p.slug + '"]')?.closest("section");
  if(!sec) return;
  sec.querySelector(".meta").textContent =
    p.slug + " · " + p.year + " · " + p.shots.length + " shots";
  const dup = p.shots.some(s => s.src === p.hero);
  sec.querySelector(".warn").textContent = dup
    ? "hero is also shot " + String(p.shots.findIndex(s => s.src === p.hero) + 2).padStart(2, "0")
    : "";
}

function row(project, shot, i){
  const li = document.createElement("li");
  li.dataset.src = shot.src;
  li.classList.toggle("iscut", !!shot.cut);
  li.classList.toggle("ishero", project.hero === shot.src);
  li.innerHTML =
    '<div class="idx"></div>' +
    '<div class="thumb"><video muted loop playsinline preload="metadata"></video></div>' +
    '<div class="body"><input class="title"><div class="file"></div></div>' +
    '<div class="tags"><span class="tag k"></span><span class="tag a"></span>' +
    '<label class="cut"><input type="checkbox">cut</label>' +
    '<button class="act hero">hero</button></div>';

  li.querySelector(".idx").textContent = i < 0 ? "—" : String(i + 2).padStart(2, "0");
  const v = li.querySelector("video");
  // The #t fragment makes the browser seek and paint a frame without playing.
  v.src = shot.src + "#t=0.6";
  li.addEventListener("mouseenter", () => { v.play().catch(()=>{}); });
  li.addEventListener("mouseleave", () => { v.pause(); v.currentTime = 0.6; });

  const t = li.querySelector(".title");
  t.value = shot.title;
  t.addEventListener("input", () => { shot.title = t.value; save(); });

  li.querySelector(".file").textContent = shot.src.replace("/media/", "");
  li.querySelector(".tag.k").textContent = shot.kind || "?";
  li.querySelector(".tag.a").textContent = shot.aspect || "?";

  const c = li.querySelector('input[type="checkbox"]');
  c.checked = !!shot.cut;
  c.addEventListener("change", () => {
    shot.cut = c.checked;
    li.classList.toggle("iscut", c.checked);
    save();
  });

  const h = li.querySelector(".hero");
  h.classList.toggle("on", project.hero === shot.src);
  h.addEventListener("click", () => {
    const p = state.find(x => x.slug === project.slug);
    p.hero = p.hero === shot.src ? null : shot.src;
    save();
    for(const el of main.querySelectorAll('ul[data-slug="' + p.slug + '"] li')){
      const on = el.dataset.src === p.hero;
      el.classList.toggle("ishero", on);
      el.querySelector(".hero").classList.toggle("on", on);
    }
    meta(p);
  });

  li.addEventListener("pointerdown", (e) => startDrag(e, li));
  return li;
}

/**
 * Reorder by pointer rather than by the HTML5 drag API.
 *
 * Everything is listened for on the window, and there is no pointer capture.
 * Capture is the obvious way to follow a pointer and the wrong one here: the
 * row being dragged is moved through the DOM as it passes the others, and
 * inserting an element that is already in the document removes it first, which
 * makes the browser drop the capture. Bound to the row, the drag then went dead
 * after its first step — one reorder, and no further movement ever arrived.
 *
 * A press only arms a drag; it becomes one after a few pixels, so a click on a
 * row to put the caret in its title is not also a reorder of one place and back.
 */
let dragging = null;
let armed = null;
const THRESHOLD = 4;

function startDrag(e, li){
  if(e.target.closest("input, label, button, textarea")) return;
  if(e.button !== 0) return;
  armed = { li, x: e.clientX, y: e.clientY };
  window.addEventListener("pointermove", onDragMove, true);
  window.addEventListener("pointerup", endDrag, true);
  window.addEventListener("pointercancel", endDrag, true);
}

/**
 * Creep the page when the pointer nears an edge, so a clip can be dragged
 * between projects that are not on screen together — a held pointer cannot
 * also turn a wheel.
 */
const EDGE = 90;
let creep = 0;
function creepStep(){
  if(!dragging) return;
  if(creep) window.scrollBy(0, creep);
  requestAnimationFrame(creepStep);
}

function onDragMove(e){
  if(armed && !dragging){
    if(Math.hypot(e.clientX - armed.x, e.clientY - armed.y) < THRESHOLD) return;
    dragging = armed.li;
    dragging.classList.add("dragging");
    creep = 0;
    requestAnimationFrame(creepStep);
  }
  if(!dragging) return;
  e.preventDefault();

  const h = window.innerHeight;
  const y = e.clientY;
  creep = y < EDGE ? -(EDGE - y) / 5 : y > h - EDGE ? (y - (h - EDGE)) / 5 : 0;

  // The dragged row is under the pointer, so ask what is behind it.
  const prev = dragging.style.pointerEvents;
  dragging.style.pointerEvents = "none";
  const under = document.elementFromPoint(e.clientX, y);
  dragging.style.pointerEvents = prev;
  if(!under) return;

  const overRow = under.closest("li");
  const list = overRow ? overRow.parentElement : under.closest("ul");
  if(!list) return;

  if(overRow && overRow !== dragging){
    const b = overRow.getBoundingClientRect();
    list.insertBefore(dragging, y < b.top + b.height / 2 ? overRow : overRow.nextSibling);
  } else if(!overRow && list !== dragging.parentElement){
    list.appendChild(dragging);
  }
}

function endDrag(){
  const li = dragging;
  dragging = null;
  armed = null;
  creep = 0;
  window.removeEventListener("pointermove", onDragMove, true);
  window.removeEventListener("pointerup", endDrag, true);
  window.removeEventListener("pointercancel", endDrag, true);
  if(!li) return;                    // a press that never became a drag
  li.classList.remove("dragging");
  commit();
}

/**
 * Read the DOM back into state. The DOM is what the drag actually moved, so it
 * is the source of truth here rather than the other way round.
 *
 * It renumbers in place instead of re-rendering: a rebuild throws away every
 * video element, and each new one has to fetch and seek before it can paint,
 * so committing a drag blanked every thumbnail and filled them back in one by
 * one.
 */
function commit(){
  for(const p of state){
    for(const which of ["shots", "spare"]){
      const ul = main.querySelector('ul[data-slug="' + p.slug + '"][data-list="' + which + '"]');
      const rows = [...ul.querySelectorAll("li")];
      p[which] = rows.map(li => findShot(li.dataset.src)).filter(Boolean);
      rows.forEach((li, i) => {
        li.querySelector(".idx").textContent =
          which === "shots" ? String(i + 2).padStart(2, "0") : "—";
      });
    }
    meta(p);
  }
  save();
}

document.getElementById("reset").addEventListener("click", () => {
  if(!confirm("Discard your changes and go back to what is in the file?")) return;
  state = clone(FILE);
  save();
  render();
});

function payload(){
  return JSON.stringify(state.map(p => ({
    slug: p.slug,
    hero: p.hero,
    shots: p.shots.map(s => ({ src: s.src, title: s.title, cut: s.cut || undefined })),
    notShown: p.spare.map(s => s.src),
  })), null, 2);
}

const dlg = document.getElementById("out");
document.getElementById("copy").addEventListener("click", async () => {
  const text = payload();
  document.getElementById("json").value = text;
  try{ await navigator.clipboard.writeText(text); }catch{}
  dlg.showModal();
});
document.getElementById("copy2").addEventListener("click", async () => {
  try{ await navigator.clipboard.writeText(payload()); }catch{}
});
document.getElementById("close").addEventListener("click", () => dlg.close());

render();
</script>
</body>
</html>
`;

await writeFile(join(REPO, "public/order.html"), html);
console.log("\nWrote public/order.html");
