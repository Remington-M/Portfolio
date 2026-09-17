# Remington McElhaney — Portfolio

A motion-design portfolio built from the Claude Design handoff in
`design_handoff_portfolio_site/`. Six projects, presented through a card-deck
mechanic: the interface itself is the motion demo.

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # static-exportable production build
npm run verify       # regression test for the video-continuity invariant
```

## Stack

| Choice | Why |
|---|---|
| **Next.js (App Router)** | A layout persists across navigations between its child routes. That persistence is what lets a playing video survive the move from the home deck to a project page. Also gives real URLs and server-rendered copy. |
| **Motion for React** | MotionValues update styles *outside* React's render cycle. The deck drives ~13 elements from one scroll position; a `setState` per scroll event would mean a full render per frame. Springs are real physics (`stiffness`/`damping`/`mass`), not approximated easings. |
| **No second animation library** | Two engines writing the same transform is a bug factory. The FLIP maths is ~80 lines in `lib/geometry.ts`, driven by the spring integrator in `lib/spring.ts`. |

## The load-bearing idea: the persistent media layer

The requirement was that a video keeps playing from screen to screen without
restarting. Most of the obvious approaches don't actually deliver that:

- **View Transitions API** snapshots the *outgoing* state as a static image, so
  a playing video freezes mid-transition, and the incoming `<video>` starts at
  zero. It's also a black box — no interruptible springs, no scrubbing.
- **Motion's `layoutId`** does not move the DOM node. It measures the outgoing
  element, mounts a new one, animates it into place and crossfades. Two
  `<video>` elements, two decoders, playback restarts.

So the cards are not rendered by either page. They live in
`components/media/MediaLayer.tsx`, which mounts once in `app/layout.tsx` and
never unmounts. Routes render the chrome around them; the layer computes each
card's geometry every frame and writes transforms directly. The `<video>`
element is never torn down, so `currentTime`, decode state and buffering all
survive the navigation intact.

This also resolves the handoff's own main open item — it asked for the desktop
home→project crossfade to become a shared-element transition where the clicked
deck card flies into the project page's device frame. Same mechanism.

`npm run verify` asserts this invariant in a real browser: it tags the `<video>`
node, navigates, and fails if a different node comes back.

### Why geometry is computed, not measured

The design's motion is authored as pure functions of scroll position precisely
so that scrubbing back up reverses it exactly. A spring chasing a
CSS-transitioned element loses that. The layer therefore owns the maths, and the
springs only run while a route change is settling — the rest of the time it
snaps, and scroll drives the cards directly.

## Layout

| Path | Contents |
|---|---|
| `lib/design.ts` | Design tokens, the card ratio rule, easing and spring configs |
| `lib/geometry.ts` | Deck, project-frame and carousel geometry — all pure functions |
| `lib/spring.ts` | Spring integrator that can be stepped or snapped per frame |
| `lib/projects.ts` | Project data. Placeholder copy and stripe fills live here |
| `components/media/` | The persistent layer and shared stage state |
| `components/home/` | Hero, deck scrubber, ledger |
| `components/case/` | Project page — desktop shot stepping, mobile carousel |

### The card ratio rule

Every card and device screen is locked to the iPhone aspect ratio (402×874) with
a proportional corner radius (55/402). Card size is derived from viewport height
through those ratios, which is what makes the layout responsive without
re-authoring it — and keeps real screen recordings from being distorted later.
Use `cardFromHeight` / `cardFromWidth` rather than hard-coding sizes.

## Responsive

Two layouts are designed: mobile below 1100px, desktop above. Tablet is
deliberately not designed — the desktop layout scales down instead, per the
handoff. Desktop content sits in a centred band capped at 1440px, so it breathes
on wide monitors without the ledger drifting away from the deck.

## Browser support notes

- **Video decoders.** iOS Safari limits concurrent decoding — older devices to
  roughly one. Only the front card, its two neighbours and the selected project
  get a real `<video>`; the rest fall back to a poster. `muted` and `playsInline`
  are both required for iOS to autoplay in place rather than going fullscreen.
- **`position: sticky`.** A transformed ancestor becomes the containing block and
  silently breaks sticky. Nothing above a sticky stage may carry a transform —
  including the media layer's own wrapper, which is deliberately untransformed.
- **OKLCH.** Baseline since 2023. `app/globals.css` carries an sRGB fallback
  behind `@supports` so older browsers get a close palette rather than a broken one.
- **`text-wrap: pretty`** is unsupported in Firefox and degrades to normal
  wrapping. Cosmetic only.
- **Reduced motion.** Not in the original design; added here. The layout and the
  scroll mapping survive; the jitter, shuffle arc, `rotateY` and parallax drift
  do not.

## Media

Raw exports go in `media-source/<slug>/<name>.mp4`, which is gitignored — they
run to hundreds of megabytes and nothing serves them. `npm run media` encodes
each one to `public/media/<slug>/<name>.mp4`, and the name carries across
untouched, so a shot's `src` is also the name of the export it came from.

```
npm run media                 # anything whose source is newer than its output
npm run media -- --force      # all of it again
npm run media -- google-pixel # one project
```

The settings live at the top of `scripts/encode-media.mjs` with the reasoning:
H.264 High / yuv420p at CRF 21 capped to 7 Mb/s, no audio, `+faststart`, and
the longest side held to 1920 without upscaling. They were read back out of the
clips that shipped first (`strings` on an MP4 prints the x264 options it was
built with) rather than picked fresh, so everything on the site matches.

A source whose name starts with `_` is held back and never encoded, which is
where alternate takes live.

### Posters

`npm run posters` draws the stills the site falls back to while a clip is
still arriving — one per project for the deck cards, and one per shot clip
beside the clip and named after it. Run it after `npm run media`; it needs the
same ffmpeg.

It writes `lib/posters.generated.ts` as well, listing the clips it drew a still
for. Nothing else should edit that file. The app reads it rather than deriving
the poster path, so a still that was never drawn leaves the attribute off
instead of 404ing — and a shot with no poster renders as an empty device, frame
and caption correct and nothing inside, which is what this exists to prevent.


Two things to know when adding a clip:

- **Set `aspect` from the encoded file, not the export.** The viewer morphs to
  the clip's shape, and an aspect that disagrees with the footage letterboxes or
  crops it. The encoder prints the number to paste.
- **`kind` picks the frame's size and corner radius, not its shape** — phone,
  square, browser window, or 16:9. The shape comes from `aspect`.

H.264 MP4 is the baseline; add a VP9 `srcWebm` alongside it for smaller files
where you can.

## The About page's Polaroid

`components/about/Polaroid.tsx` draws the print as a **mesh**, not a rectangle:
a 40×48 grid in plain WebGL 1, with no library behind it. The reason is that
the print has to flex — a twist as it turns over, a bend as it lands — and CSS
3D can only rotate a flat plane. Slicing a card into strips to fake curvature
leaves seams; three.js for one bent quad would be the second animation engine
this README rules out. WebGL 1 has shipped in every browser we target since
2014, and where it is missing or the context is lost the same button becomes a
flat CSS flip of the same two faces, with the development approximated in
filters. Screen readers get the picture's alt text and the caption either way.

Two things in it worth knowing:

- **The turn is two springs.** A tap flicks the print over from its bottom
  edge, so the top edge leads and the bottom lags; each row of the mesh is
  rotated by a blend of the two, and the difference is the twist. Both settle
  at a half turn, so the twist unwinds as the print comes to rest. Curvature
  is a third spring, kicked by the tap and by the landing, that always springs
  back to flat. The springs are the repo's own integrator, and the frame loop
  stops when they do.
- **The development follows the chemistry.** Integral film starts under a dark
  opacifier that clears as the reagent's alkalinity drops; underneath, the
  dyes migrate up at different rates — cyan first, then magenta, then yellow —
  so the first ghost is a cold monochrome that warms last. The reagent spreads
  from the pod in the wide border, so the bottom runs a little ahead of the
  top, and it spreads unevenly, so it comes up in blotches. Density builds as
  a power of the final value, the way dye accumulates, so contrast arrives
  with the colour. Eight seconds, for a process that really takes fifteen
  minutes. Tunables are at the top of `lib/polaroid.ts`.

The picture is `public/about/portrait.jpg`: a 1400px square cut from the
original, which is what the window shows and all a ~300px print needs. Keep
originals out of `public/` — everything there is published, and a camera
export runs to megabytes. `scripts/about-placeholder.mjs` draws the stand-in
that was there before, if one is ever needed again.

## Still placeholder

- **Copy.** Five of six projects have placeholder overview text and collaborator
  names. Google Pixel has real copy.
- **About page.** The layout, the Polaroid, the photo and the role line are
  real; the copy in `lib/about.ts` is not.
- **Device frames in the Google footage.** The design draws no bezel — the
  viewer is a rounded rectangle holding the picture and nothing else. Six of the
  Pixel and gesture clips were exported with a phone body rendered onto white,
  so those play a drawn phone inside the frame. Re-exporting the screen alone is
  the fix; cropping them here would guess at the screen rect.
