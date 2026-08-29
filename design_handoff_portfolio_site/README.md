# Handoff: Motion Designer Portfolio Site

## Overview

A personal portfolio site for Remington McElhaney, a UX motion designer. Six projects, presented through a
card-deck mechanic rather than a conventional grid: the interface itself is the motion demo.

Two breakpoints are designed:

- **Desktop (1440×900)** — vertical scroll-driven card deck on the home page; project pages pair a text
  intro with a morphing device frame, then step through shots one at a time.
- **Mobile (390×844)** — same vertical deck on home; project pages are a **horizontal** carousel of shots.

The axis split is deliberate on mobile: **vertical = next project, horizontal = next shot.** Two levels of
hierarchy, two gestures. Do not collapse them into one scroll direction.

## About the Design Files

The files in this bundle are **design references created in HTML** — prototypes that show intended look,
geometry, timing, and behavior. They are not production code to copy.

The task is to **recreate these designs in the target codebase's environment** (React, Next, Vue, Svelte,
etc.) using its established patterns, routing, and component conventions. If no codebase exists yet, choose
an appropriate framework and implement there. Expect to rewrite the layout logic — much of it here is
computed inline in JS because the prototype format required it, and a real implementation should use CSS
(sticky positioning, scroll-snap, container queries, media queries) wherever it can.

## Fidelity

**High-fidelity.** Colors, typography, spacing, geometry, and animation timings are final and specified
below. Recreate them precisely. Two exceptions, both marked in the doc:

- All project media is **placeholder** (diagonal-stripe fills and flat dark rectangles) except one real clip,
  `media/airbnb-setup.mp4`.
- Project page body copy and collaborator names are **placeholder** on five of six projects.

---

## Design Tokens

### Color (OKLCH — these are the authored values, convert as needed)

| Token | Value | Use |
|---|---|---|
| Page background | `oklch(0.963 0.008 80)` | warm off-white, every screen |
| Ink | `oklch(0.18 0.006 60)` | all text |
| Ink 66% | `oklch(0.18 0.006 60 / 0.66)` | body copy (via `opacity: 0.66`) |
| Ink 42% | `opacity: 0.42` | mono labels (YEAR, COLLABORATORS) |
| Ink 32% / 34% | `opacity: 0.32–0.34` | inactive nav, index counter |
| Hairline | `oklch(0.18 0.006 60 / 0.14)` | rules under intro text |
| Frame edge | `oklch(0.18 0.006 60 / 0.1)` | 1px inset ring on cards and page edge |
| Device body | `oklch(0.2 0.006 60)` | phone bezel + screen base |
| Empty shot fill | `oklch(0.28 0.006 60)` | unpopulated shot screens |
| Ghost card | `oklch(0.905 0.012 80)` | return-to-deck cards (desktop) |
| Return card | `oklch(0.912 0.012 80)` | last carousel card (mobile) |
| Link hover | `oklch(0.58 0.14 25)` | `a:hover` |

### Typography

Two families, both Google Fonts:

- **Archivo** — 400, 500, 600. All display and body text.
- **IBM Plex Mono** — 400, 500. All labels, meta, counters, nav.

| Role | Spec |
|---|---|
| Home headline (desktop) | Archivo 400, 42px, line-height 50.81px, `letter-spacing: -0.03em`, `text-wrap: pretty`, centered |
| Home headline (mobile) | Archivo 400, 26px/1.28, `-0.026em`, centered |
| Project title (desktop intro) | Archivo 400, 56px/1.02, `-0.04em` |
| Project title (mobile intro) | Archivo 400, 34px/1.06, `-0.034em` |
| Intro body copy | Archivo 400, 18px/1.55, opacity 0.66 (desktop) · 15px/1.55 (mobile) |
| Shot title | Archivo 400, 26px/1.14, `-0.028em` (desktop) · 21px/1.14, `-0.026em` (mobile) |
| Ledger row, active | Archivo 400, 28px/1.1, `-0.032em`, opacity 1 |
| Ledger row, inactive | Archivo 400, 20px/1.1, `-0.024em`, opacity 0.36 |
| Nav / header | IBM Plex Mono 500, 12px (desktop) · 10px (mobile), `0.06em`, uppercase |
| Page kicker | IBM Plex Mono 400, 10px, `0.1em`, opacity 0.3 |
| Meta labels + values | IBM Plex Mono 400, 9.5px/1.8, `0.06em` |
| Shot meta / counters | IBM Plex Mono 400, 9–9.5px, `0.11–0.12em`, opacity 0.4 |
| Numeric counters | add `font-variant-numeric: tabular-nums` |

### Geometry — the card ratio rule

**Every card and device screen is locked to the iPhone aspect ratio.** Reference device is 402×874 →
**w/h = 0.4599**. Corner radius is proportional to the same reference: **55/402 = 0.137 × width.** If you
resize any card, recompute both from these ratios. Aspect drift will distort real screen recordings once
they replace the placeholders.

| Card | Size | Radius |
|---|---|---|
| Desktop deck card | 322 × 700 | 44 |
| Desktop device screen (project page) | 271 × 589 | 37 inner / 45 outer bezel, 8px bezel padding |
| Desktop return-to-deck card | 260 × 565 | 36 |
| Mobile home deck card | 252 × 548 | 34 |
| Mobile carousel card | 280 × 609 | 38 |

### Spacing

Desktop page padding `28px 64px` (header), `120px` left gutter for content columns.
Mobile page padding `22px 24px` (header), `24px` gutters.
Gaps: `40px` between ledger blocks, `32px` between meta cells, `14px` between carousel cards.

### Shadow

- Card at rest: `0 20px 40px -22px oklch(0.35 0.02 60 / 0.4)` + `inset 0 0 0 1px oklch(0.18 0.006 60 / 0.09)`
- Front deck card (desktop): `0 28px 56px -28px oklch(0.35 0.02 60 / 0.45)` + same inset
- Device frame: `0 36px 70px -34px oklch(0.35 0.02 60 / 0.5)`
- Carousel card: `0 24px 48px -24px oklch(0.35 0.02 60 / 0.42)` + inset ring

### Easing

**`cubic-bezier(.2,.85,.15,1)`** is the house curve — use it for every position, size, and transform
transition. Opacity crossfades use `ease` or `linear` at 0.2–0.4s. Durations in use: 0.2s (opacity under
scroll), 0.3–0.46s (deck exit, nav crossfade), 0.55–0.58s (card grow/rise), 0.82s (desktop device morph).

---

## Screens

### 1. Home — Desktop (`Portfolio Site.dc.html`)

**Purpose:** browse the six projects; open one.

**Layout:** A 1440×900 viewport with `overflow: hidden`. Inside, a scroll container 4020px tall whose first
child is `position: sticky; top: 0; height: 900px`. All motion is driven by that container's `scrollTop`;
nothing actually moves down the page.

Scroll math: `intro = min(1, scrollTop / 440)` drives the hero-to-deck transition. `p = (scrollTop - 440) / 440`
is the deck index — fractional, so the shuffle is continuous. Snap points every 440px (`scroll-snap-type: y proximity`).

**Header** (z 70, absolute, `28px 64px`): name left, Archivo 600 15px, `-0.01em`. Nav right: "Work" (active),
"About" (opacity 0.42), mono 500 12px uppercase, `26px` gap.

**Hero** (z 52, `top: 176`, full width): centered headline, max width driven by the `heroWidth` tweak
(default 760, range 440–1200). Fades and drifts away as you scroll: `opacity = max(0, 1 - intro * 1.9)`,
`transform: translate(-intro * 150px, -intro * 44px)`, `pointer-events: none` past `intro > 0.4`.

**Ledger** (appears as hero leaves): `left: 120`, vertically centered, width 460. Six rows, each a
`1fr auto` grid — project name left, year right, `12px 0` padding. Active row scales up (28px vs 20px) and
goes to full opacity; year goes 0.2 → 0.5. Row transition:
`font-size .45s <house>, opacity .35s ease, letter-spacing .45s ease`. Clicking a row scrolls the container
to `440 + i * 440` with `behavior: smooth`. Whole block fades in on `opacity = clamp((intro - 0.45) * 2.2)`.

**Card deck:** six 322×700 cards, all absolutely positioned at the same origin, differentiated only by
transform. Origin moves as the hero leaves: `cx = 720 + intro * 265`, `cy = 770 - intro * 275`.

Each card's depth is `kc = ((i - p) mod 6 + 6) mod 6` — 0 is the front card, 5 the back. For `kc < 5`:

```
x     = kc * 9  + jitterX * 0.4 * min(1, kc)
y     = -kc * 15 + jitterY * 0.55 * min(1, kc)
scale = 1 - kc * 0.028
rot   = kc < 0.02 ? 0 : jitterR * (0.3 + 0.12 * kc)
opacity = max(0.24, 1 - kc * 0.11)
z     = 50 - kc
```

Jitter is deterministic per card, from `sin((i+1) * 12.9898 + k * 78.233) * 43758.5453` fract — amplitudes
±30px x, ±16px y, ±7° rotation. Keep it seeded, not random: the scatter must be identical every load.

For `kc >= 5` the card is mid-shuffle, swinging out right and tucking behind. With `t = 1 - (kc - 5)`,
`ew = smoothstep(t)`, `arc = sin(t * π)`:

```
x       = deepX * ew + arc * 198
y       = deepY * ew - arc * 40
rot     = deepRot * ew + arc * 7
rotateY = -arc * 18            (perspective: 1600px)
opacity = 1 - 0.78 * ew
z       = t < 0.5 ? 60 : 45
```

That arc — out to the right, rotating in Y, then dropping to the back of the stack — is the signature
motion of the site. Get it right.

Only the front card takes pointer events (`kc < 0.4`). Clicking it opens that project.

**Cards carry no titles.** The ledger names the project; the card is only image.

---

### 2. Home — Mobile (`Portfolio Mobile.dc.html`)

Same deck mechanic, tuned down: container 2820px tall, snap and step every 300px, `intro = scrollTop / 300`.

**Header:** nav only — "Work / About", mono 500 10px, `16px` gap. No name (removed deliberately).

**Hero:** `left/right: 24`, `top: 132`, 26px headline, same fade-out at `1 - intro * 1.9` with a −34px drift.

**Deck:** 252×548 cards centered at `cx = 195`, `cy = 118 + 274 + (1 - intro) * 208` — so the deck starts low
and rises to `top: 118` as the hero clears. Depth offsets are tighter than desktop: `x = kc * 5`,
`y = -kc * 8`, `scale = 1 - kc * 0.026`, jitter ±13/±7/±4.2°, shuffle arc `140px` x / `26px` y / `-16°` rotateY.

**Label group** (`left/right: 24`, `bottom: 36`, centered column, `9px` gap): active project title
(Archivo 400 22px), year (mono 9.5px, opacity 0.42), then a row of six ticks (`7px` gap). Ticks are 1px
`currentColor` bars — active is 26px wide at opacity 0.72, neighbors 10px at 0.26, the rest 0.13; width
transitions over `.45s <house>`. Tapping a tick scrolls to that project. Group fades in with the same
`(intro - 0.45) * 2.2` ramp.

---

### 3. Project page — Desktop (`ProjectCase.dc.html`, `PixelCase v2.dc.html`)

**Purpose:** step through a project's shots, one at a time.

Two files exist on purpose:

- **`ProjectCase.dc.html`** is the reusable template — props `title`, `year`, `overview`, `collaborators`,
  `shotCount` (default 5). Five of six projects use it. Portrait frames only.
- **`PixelCase v2.dc.html`** is the fully built-out Google Pixel case, with nine real shots and a
  **morphing viewport**: the frame changes shape per shot — portrait 271×589, square 470×470,
  desktop 680×425 (with a 30px window title bar and three dots), landscape 710×400 (centered above the text
  rather than beside it). The morph is a single `.82s <house>` transition across width, height, padding,
  border-radius, top, left, right, and transform. This is the model for how a rich project page behaves once
  content exists; `ProjectCase` is the skeleton for the rest.

**Layout:** 1440×900 scroll container, `overflow: auto`, spacer height `200 + shots * 780 + 1000`, sticky
900px stage. `p = (scrollTop - 200) / 780` — one shot per 780px.

**Header** (`28px 64px`, mono 10px, `0.1em`): "← WORK" at opacity 0.5, then the kicker
("GOOGLE PIXEL · 2016 — 2020" / "PROJECT · YEAR") at 0.3.

**Screen 01 — intro.** Text block at `left: 120`, width 500, `max-width: 470`, `top: 214`. Title 56px, body
18px/1.55 at 0.66, then a hairline rule and a single meta row: **YEAR** (content-width) and
**COLLABORATORS** (fills remaining width, wraps to more lines as names are added). Role is deliberately
absent — it never varies across projects and belongs on the About page. The device frame sits `right: 200`,
`top: 95`. As you scroll away: `opacity = 1 - |p| * 1.9`, `translateY(-p * 44px)`.

**Screens 02+ — shots.** The frame moves to horizontal center and bottoms out at a fixed baseline
**BASE = 689** (`top = 689 - height`), so devices of different shapes share one bottom edge. Below it, at
`BASE + 26`, the shot title (26px) and mono meta line. Only one title is visible at a time —
`opacity = max(0, 1 - |p - i| * 2.4)`, `translateY((p - i) * 26px)`.

**Progress** (`bottom: 46`, centered column, `12px` gap): a row of ticks — active 30px at 0.72, neighbors
12px at 0.26, rest 0.13 — over an `NN / NN` counter (mono 9px, tabular). Clicking a tick scrolls to
`200 + i * 780`.

**Scroll end — return to the deck.** Past the last shot, `r = clamp((p - (n-1)) / 0.85)` drives a reverse of
the entry: the device frame interpolates from its current geometry to a 260×565 card at `top: 96`, radius 36,
bezel padding to 0; three ghost cards fan out behind it (offsets `x 0/-46/52/-18`, `y 0/16/30/46`,
rotation `0/-5.5/4.5/-2.5°`, scale `1/0.94/0.885/0.83`, staggered fade-in at `(r - k * 0.11) * 3`), and
"RETURN TO WORK" fades up at `(r - 0.55) / 0.45`. Title and progress fade out on `1 - r * 2.2`. All of it is
scroll-position-driven, so scrubbing back up reverses it exactly — set `transition: none` on the frame while
`r > 0` so the scroll drives it directly instead of chasing a CSS transition.

**`editLayout` prop:** both files have a boolean that unrolls the sticky stage into a flat, static column of
all sections. It exists for reviewing copy in the design tool. Not a product feature — drop it.

---

### 4. Project page — Mobile (`Portfolio Mobile.dc.html`, case route)

**Purpose:** swipe through a project's shots.

A horizontal snap carousel, `top: 106`, height `609 + 40`, `display: flex`, `gap: 14`,
`padding: 0 55px` (= `(390 - 280) / 2`, which centers the first and last cards), `scroll-snap-type: x mandatory`,
`scroll-snap-align: center` per card, scrollbar hidden, `touch-action: pan-x`, `cursor: grab`.

Seven items: shot 01 (the project's clip), five blank shots (flat `oklch(0.28 0.006 60)` with a mono number
bottom-center at 0.24 opacity), and a final light **"RETURN TO WORK"** card (`oklch(0.912 0.012 80)`, 1px
inset ring, label centered) that navigates home on tap.

**Off-center cards tilt.** With `d = index - scrollPosition`: rotation `sign(d) * min(1, |d|) * 1°`, pivoting
from the card's **center** so cards stay vertically aligned and just sit off-kilter; plus `translateY` up to
8px and `scale` down to 0.965, opacity down to 0.76. Cards left of center lean one way, right the other.
Transition `.55s <house>`. Keep it subtle — this was tuned down twice.

**Title** at `card bottom + 30` (y = 745), centered: shot title 21px over mono meta at 0.4. Titles slide
horizontally with the swipe (`translateX((rp - i) * 26px)`) and crossfade at `1 - |rp - i| * 2.4`.

**No progress indicator here** — the peeking neighbors carry position. (Home keeps its ticks; the vertical
deck genuinely hides what's behind it.)

**Input:** the prototype adds wheel-to-horizontal mapping and pointer drag (with snap-to-nearest on release)
so it can be driven by a mouse. On a real device, native touch scrolling plus `scroll-snap` is enough — keep
a pointer-drag affordance only if desktop visitors will see this layout.

---

## Interactions & Behavior

### Home → project (mobile, fully prototyped)

1. Tap the front card. The five cards behind it drop away — `translateY(+300 + kc * 26)`, rotation ±9°,
   opacity to 0 — over `.46s <house>`. The front card does not move. The label group fades out.
2. At **300ms**, swap routes. The carousel mounts with its first card at the *home* card's geometry
   (252×548).
3. At **+40ms**, set the entered flag: the card grows to 280×609, radius 34 → 38, and rises to `top: 106`
   over `.55s <house>`; neighbor cards fade in with an 80ms delay; header crossfades from nav to "← WORK"
   (`.35s` opacity, 120ms delay, plus an 8px slide-in); title fades up 14px.

Return reverses it: clear entered (card shrinks back, `.38s`), swap routes, then clear the leaving flag so
the deck fans back in.

**Why this sequence:** the card is continuous across the navigation, so the transition has to signal change
some other way. Two signals do it — the **count** of objects changes (six cards become one), and the card
**lands somewhere new** (grows and rises). A background color change was considered and rejected as cheap.

### Home → project (desktop)

Currently a crossfade: home scales to 0.985 and fades, case page fades in from 1.015 (`.5s` opacity,
`.7s <house>` transform). The case page mounts only while routed to it. **This is the main thing to upgrade
in code:** it should be a shared-element transition — the clicked deck card flies to become the project
page's device frame. The geometry is already compatible (both are the same ratio; the case frame's entry
size and position are known), which is why the return-to-deck ending was built to the same numbers.

### Autoplay

Cards with a clip use `<video autoplay muted loop playsinline>` and a ref that forces `muted = true` and
calls `play()` with a caught rejection. In production, only play the front card and its immediate
neighbors — six simultaneous videos will not hold frame rate on a phone.

---

## State

| State | Type | Purpose |
|---|---|---|
| `route` | `'home' \| 'case'` | which view is mounted |
| `sel` | index or null | selected project |
| `p` | float | home deck position (fractional = mid-shuffle) |
| `pi` | 0–1 | hero-to-deck intro progress |
| `cp` / `rp` | float | shot position — vertical on desktop, rail scrollLeft / pitch on mobile |
| `leaving` | bool | deck-exit animation running |
| `entered` | bool | card has grown into project-page geometry |

Two chained `setTimeout`s sequence the mobile transition (300ms, then 40ms). In a real implementation prefer
transition/animation events or a spring library over timers — the timers are a prototype expedient and will
desync if durations change.

For routing: give each project a slug and a real URL (`/work/airbnb-setup`). Preserve deck position when
returning home, so the deck doesn't reset to the first project.

---

## Responsive

Two designed layouts: **≤ ~430px** (mobile) and **≥ ~1200px** (desktop). Tablet is **not designed** — scale
the desktop layout down rather than inventing a third arrangement, or ask before designing one.

The desktop ledger needs its 120px gutter and 460px column; below roughly 1100px it should collapse to the
mobile pattern (title + year + ticks under the deck) rather than compress.

---

## Not built

- **About page.** Does not exist. It's where the role line lives — "some version of UX Motion Designer,
  JR through Staff" — which is why no project page carries a role field.
- **Real media.** One clip exists (`media/airbnb-setup.mp4`, on Airbnb Setup). Everything else is a
  placeholder fill. Diagonal-stripe fills use `repeating-linear-gradient(135deg, oklch(0.5 0.1 <hue>) 0 18px,
  oklch(0.4 0.09 <hue>) 18px 36px)` with a slow `drift` keyframe; per-project hues are
  30 / 340 / 300 / 250 / 200 / 80 in list order. All of it is scaffolding — delete it when real clips land.
- **Project copy.** Five of six projects have placeholder overview text and collaborator names. Google Pixel
  has real copy in `PixelCase v2.dc.html`.
- **Shot content.** Every project except Google Pixel has five blank numbered shots. The count is a prop.

## Projects, in home-page order

| # | Project | Year | Media | Page |
|---|---|---|---|---|
| 1 | Airbnb Setup | 2025 | `media/airbnb-setup.mp4` | ProjectCase (placeholder copy) |
| 2 | Airbnb Host Experience | 2025 | placeholder | ProjectCase (placeholder copy) |
| 3 | Airbnb Listing Editor | 2024 | placeholder | ProjectCase (placeholder copy) |
| 4 | Gesture Navigation | 2020 | placeholder | ProjectCase (placeholder copy) |
| 5 | The New Google Assistant | 2020 | placeholder | ProjectCase (placeholder copy) |
| 6 | Google Pixel | 2018 | placeholder | **PixelCase v2** — real copy, 9 shots, morphing viewport |

## Assets

- **Fonts:** Archivo (400/500/600) and IBM Plex Mono (400/500), Google Fonts. Self-host in production.
- **Video:** `media/airbnb-setup.mp4`.
- **Icons:** none. Arrows are the text characters `←` and `→`.
- No image assets, no icon library, no SVG illustration.

## Files

| File | Contents |
|---|---|
| `Portfolio Site.dc.html` | Desktop home: hero, ledger, card deck, shuffle mechanic, routing |
| `Portfolio Mobile.dc.html` | Mobile home **and** mobile project page (horizontal carousel), full transition |
| `ProjectCase.dc.html` | Desktop project page template — props-driven, 5 blank shots |
| `PixelCase v2.dc.html` | Desktop Google Pixel case — real copy, 9 shots, morphing viewport |
| `PixelCase.dc.html` | **Superseded.** Earlier text-heavy version, kept for reference only |
| `Portfolio Directions.dc.html` | 22 turns of exploration — the rejected directions, for context |
| `media/airbnb-setup.mp4` | The one real clip |
| `support.js` | Prototype runtime. **Not part of the design** — do not port it |

The `.dc.html` files open directly in a browser. Read geometry and timing from the JS classes at the bottom
of each file; the numbers in this README are drawn from them.
