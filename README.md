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

## Still placeholder

- **Media.** One real clip (`public/media/airbnb-setup.mp4`). Everything else is
  a diagonal-stripe fill. Delete `stripeFill` and the `hue` fields when real
  clips land. H.264 MP4 is the baseline; add a VP9 `srcWebm` alongside it for
  smaller files where you can.
- **Copy.** Five of six projects have placeholder overview text and collaborator
  names. Google Pixel has real copy.
- **Shots.** Every project except Google Pixel has five blank numbered shots.
- **About page.** Does not exist yet. It's where the role line belongs, which is
  why no project page carries a role field.
- **Pixel morphing viewport.** The frame geometry supports portrait, square,
  desktop and landscape shapes (`frameBox`), and Google Pixel's nine shots are
  in the data. The morph is wired but hasn't been tuned against the design.
