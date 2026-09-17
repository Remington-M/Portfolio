#!/usr/bin/env node
/**
 * A local editor for everything written on the site: project overviews and
 * collaborator lines, the title under every shot, and the About page.
 *
 *   npm run copy   →   http://localhost:3210
 *
 * It edits `content/copy.json` in place. Every field saves itself a moment
 * after you stop typing, and the dev server on :3000 reloads the page you are
 * looking at, so the site is the preview. Nothing here is in the build — the
 * page is served by this script alone and never lands in `public/`.
 *
 * The site's structure (which projects, which shots, in what order) is read
 * out of `lib/projects.ts` so the editor lists them the way the site does.
 * The writing is the only thing it changes.
 */
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const COPY = join(REPO, "content/copy.json");
const PORT = Number(process.env.PORT ?? 3210);
const SITE = process.env.SITE ?? "http://localhost:3000";

/** Slug, title and ordered shot keys per project, read out of the source. */
async function structure() {
  const source = await readFile(join(REPO, "lib/projects.ts"), "utf8");
  const marks = [...source.matchAll(/\n    slug: "([a-z0-9-]+)",/g)].map((m) => ({
    slug: m[1],
    at: m.index,
  }));
  return marks.map((mark, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].at : source.length;
    const text = source.slice(mark.at, end);
    const head = text.slice(0, text.indexOf("shots:"));
    const title = head.match(/\n\s*title: "([^"]+)",/)?.[1] ?? mark.slug;
    const year = head.match(/\n\s*year: "([^"]+)",/)?.[1] ?? "";
    const hero = head.match(/src: "(\/media\/[^"]+)"/)?.[1] ?? null;
    const shots = [];
    const re = /\{\s*n: "(\d+)",[^}]*?(?:src|poster): "([^"]+)"/g;
    let s;
    while ((s = re.exec(text.slice(text.indexOf("shots:"))))) {
      const file = s[2].slice(s[2].lastIndexOf("/") + 1);
      shots.push({ n: s[1], key: file.replace(/\.[a-z0-9]+$/i, ""), src: s[2] });
    }
    return { slug: mark.slug, title, year, hero, shots };
  });
}

const page = (data) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Copy</title>
<style>
  :root{ --page:#f4f2ee; --card:#fff; --ink:#14110d; --ink-2:#5d574e; --ink-3:#8d857a;
         --rule:#e2ddd4; --accent:#14110d; --ok:#2f7a4a; --warn:#b4560f; }
  @media (prefers-color-scheme: dark){
    :root{ --page:#15130f; --card:#1e1b16; --ink:#f2efe9; --ink-2:#a9a196; --ink-3:#7a736a;
           --rule:#2e2a24; --accent:#f2efe9; --ok:#7fc79a; --warn:#e9995a; }
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--page);color:var(--ink);
       font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
  header{position:sticky;top:0;z-index:10;background:var(--page);border-bottom:1px solid var(--rule);
         padding:12px 20px;display:flex;gap:14px;align-items:center;flex-wrap:wrap}
  h1{font-size:15px;margin:0;font-weight:600}
  nav{display:flex;gap:10px;flex-wrap:wrap}
  nav a{color:var(--ink-2);text-decoration:none;font-size:13px}
  nav a:hover{color:var(--ink)}
  .spacer{flex:1}
  #status{font-size:12.5px;color:var(--ink-3)}
  #status.saving{color:var(--warn)} #status.saved{color:var(--ok)} #status.error{color:#c0392b}
  main{padding:20px;display:grid;gap:26px;max-width:960px;margin:0 auto}
  section{background:var(--card);border:1px solid var(--rule);border-radius:12px;padding:18px 20px;scroll-margin-top:70px}
  section h2{font-size:17px;margin:0 0 2px;letter-spacing:-.01em;display:flex;gap:10px;align-items:baseline}
  section h2 small{font-weight:400;color:var(--ink-3);font-size:13px}
  section h2 a{margin-left:auto;font-size:12.5px;font-weight:500;color:var(--ink-2)}
  label{display:block;font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3);margin:16px 0 6px}
  input,textarea{width:100%;font:inherit;color:var(--ink);background:var(--page);
                 border:1px solid var(--rule);border-radius:8px;padding:8px 10px}
  textarea{min-height:110px;resize:vertical;line-height:1.55}
  input:focus,textarea:focus{outline:none;border-color:var(--ink-3)}
  .placeholder{border-color:var(--warn)}
  .shots{display:grid;gap:8px;margin-top:6px}
  .shot{display:grid;grid-template-columns:44px 30px 1fr;gap:10px;align-items:center}
  .shot .n{color:var(--ink-3);font-variant-numeric:tabular-nums;font-size:12.5px}
  .shot video,.shot img{width:44px;height:44px;object-fit:cover;border-radius:6px;background:var(--rule);display:block}
  .hint{color:var(--ink-3);font-size:12px;margin:8px 0 0}
  .paras{display:grid;gap:8px}
  .paras textarea{min-height:80px}
  button{font:inherit;font-size:12.5px;border:1px solid var(--rule);background:var(--card);
         color:var(--ink);border-radius:8px;padding:5px 10px;cursor:pointer;margin-top:8px}
</style>
</head>
<body>
<header>
  <h1>Copy</h1>
  <nav>${data.structure.map((p) => `<a href="#${p.slug}">${p.title}</a>`).join("")}<a href="#about">About</a></nav>
  <span class="spacer"></span>
  <span id="status">Saved</span>
</header>
<main id="main"></main>
<script>
const SITE = ${JSON.stringify(SITE)};
const structure = ${JSON.stringify(data.structure)};
let copy = ${JSON.stringify(data.copy)};

const PLACEHOLDER = /goes here|Name Surname|^Untitled/;
const status = document.getElementById("status");
let timer, inflight;

function mark(el){ el.classList.toggle("placeholder", PLACEHOLDER.test(el.value)); }

function queue(){
  status.textContent = "Editing…"; status.className = "saving";
  clearTimeout(timer);
  timer = setTimeout(save, 400);
}

async function save(){
  if (inflight) { await inflight; }
  status.textContent = "Saving…"; status.className = "saving";
  inflight = fetch("/copy.json", { method: "PUT", headers: { "content-type": "application/json" },
                                    body: JSON.stringify(copy) })
    .then((r) => { if (!r.ok) throw new Error(r.statusText);
                   status.textContent = "Saved"; status.className = "saved"; })
    .catch((e) => { status.textContent = "Not saved: " + e.message; status.className = "error"; })
    .finally(() => { inflight = null; });
}

function field(kind, value, onInput, attrs = {}){
  const el = document.createElement(kind === "area" ? "textarea" : "input");
  el.value = value;
  Object.assign(el, attrs);
  el.addEventListener("input", () => { onInput(el.value); mark(el); queue(); });
  mark(el);
  return el;
}

function labelled(text, el){
  const l = document.createElement("label"); l.textContent = text;
  const wrap = document.createDocumentFragment(); wrap.append(l, el); return wrap;
}

const main = document.getElementById("main");

for (const p of structure) {
  const c = (copy.projects[p.slug] ??= { overview: "", collaborators: "", shots: {} });
  const s = document.createElement("section"); s.id = p.slug;
  s.innerHTML = '<h2>' + p.title + ' <small>' + p.year + '</small>' +
    '<a href="' + SITE + '/work/' + p.slug + '" target="site">Open on site ↗</a></h2>';
  s.append(labelled("Overview", field("area", c.overview, (v) => c.overview = v)));
  const hint = document.createElement("p"); hint.className = "hint";
  hint.textContent = "A blank line starts a new paragraph.";
  s.append(hint);
  s.append(labelled("Collaborators", field("input", c.collaborators, (v) => c.collaborators = v)));
  const sl = document.createElement("label"); sl.textContent = "Shots"; s.append(sl);
  const shots = document.createElement("div"); shots.className = "shots";
  for (const shot of p.shots) {
    const row = document.createElement("div"); row.className = "shot";
    const thumb = /\\.mp4$/.test(shot.src) ? document.createElement("video") : document.createElement("img");
    thumb.src = SITE + shot.src;
    if (thumb.tagName === "VIDEO") {
      thumb.muted = true; thumb.loop = true; thumb.preload = "metadata"; thumb.playsInline = true;
      // A clip with only its metadata loaded paints nothing; a seek fetches one frame.
      thumb.addEventListener("loadedmetadata", () => { thumb.currentTime = 0.5; }, { once: true });
      row.addEventListener("pointerenter", () => thumb.play().catch(() => {}));
      row.addEventListener("pointerleave", () => thumb.pause());
    }
    const n = document.createElement("span"); n.className = "n"; n.textContent = shot.n;
    row.append(thumb, n, field("input", c.shots[shot.key] ?? "", (v) => c.shots[shot.key] = v,
                               { placeholder: shot.key }));
    shots.append(row);
  }
  s.append(shots);
  main.append(s);
}

{
  const a = copy.about;
  const s = document.createElement("section"); s.id = "about";
  s.innerHTML = '<h2>About<a href="' + SITE + '/about" target="site">Open on site ↗</a></h2>';
  s.append(labelled("Lead", field("area", a.lead, (v) => a.lead = v, { style: "min-height:70px" })));
  const pl = document.createElement("label"); pl.textContent = "Paragraphs"; s.append(pl);
  const paras = document.createElement("div"); paras.className = "paras";
  const renderParas = () => {
    paras.replaceChildren();
    a.body.forEach((text, i) => {
      paras.append(field("area", text, (v) => a.body[i] = v));
    });
  };
  renderParas();
  s.append(paras);
  const add = document.createElement("button"); add.textContent = "Add paragraph";
  add.addEventListener("click", () => { a.body.push(""); renderParas(); queue(); });
  const drop = document.createElement("button"); drop.textContent = "Remove last";
  drop.addEventListener("click", () => { if (a.body.length > 1) { a.body.pop(); renderParas(); queue(); } });
  s.append(add, " ", drop);
  s.append(labelled("Based", field("input", a.based, (v) => a.based = v)));
  s.append(labelled("Back of the print (one line each)",
    field("area", a.back.join("\\n"), (v) => a.back = v.split("\\n"), { style: "min-height:70px" })));
  main.append(s);
}
</script>
</body>
</html>`;

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/") {
      const copy = JSON.parse(await readFile(COPY, "utf8"));
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(page({ copy, structure: await structure() }));
    } else if (req.method === "PUT" && req.url === "/copy.json") {
      let body = "";
      for await (const chunk of req) body += chunk;
      const copy = JSON.parse(body);
      if (!copy.projects || !copy.about) throw new Error("not a copy file");
      await writeFile(COPY, JSON.stringify(copy, null, 2) + "\n");
      res.writeHead(204).end();
    } else {
      res.writeHead(404).end();
    }
  } catch (e) {
    res.writeHead(500, { "content-type": "text/plain" }).end(String(e));
  }
});

server.listen(PORT, () => {
  console.log(`Copy editor at http://localhost:${PORT}  (site: ${SITE})`);
});
