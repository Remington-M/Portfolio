import type { ShotKind } from "./design";
import { copy, shotKey } from "./copy";

export type Shot = {
  n: string;
  title: string;
  kind: ShotKind;
  /**
   * The clip's true width / height.
   *
   * The viewer takes its shape from this rather than from a shape authored by
   * hand, because anything else crops: the frames were laid out as tidy
   * proportions and the footage is whatever it is, so five of these were
   * losing 12% of the picture to `object-fit: cover`.
   *
   * Measured off the encoded file rather than the export, and measured as the
   * browser measures it. `scale` rounds both sides to even numbers for yuv420p
   * — 1178x2556 lands at 884x1920 — and carries the remainder in the sample
   * aspect ratio, so `videoWidth` comes back 885. Taking the stored pixels and
   * ignoring the SAR gets a number that is wrong in the fourth decimal, which
   * is the difference between a fit and a hairline letterbox.
   */
  aspect?: number;
  /**
   * Arrive at this shot by cutting to it, with no transition at all.
   *
   * The push exists to announce a change the geometry did not: two clips of
   * the same proportions get the full slide precisely because the viewer has
   * nothing to say about them. That is the right default, and exactly wrong
   * for a pair that is the same picture a step further on — a screen with the
   * photos filled in after a screen with them empty. Sliding a viewport-width
   * of travel under a change of that size announces far more than happened.
   *
   * A cut swaps the clip where it stands and lets the caption underneath carry
   * the step on its own. The flag belongs to the LATER shot of the pair, so it
   * reads as "this one follows straight on from the last" and holds in both
   * directions — stepping back up is the same non-event as stepping down.
   */
  cut?: boolean;
  src?: string;
  srcWebm?: string;
  poster?: string;
};

/** The project as authored here: everything but its writing. */
type ProjectStructure = Omit<Project, "overview" | "collaborators" | "shots"> & {
  shots: Omit<Shot, "title">[];
};

export type Project = {
  slug: string;
  title: string;
  /** Two-line title for the project page, where the design breaks it. */
  displayTitle?: string[];
  year: string;
  /** Kicker year range, when it differs from the ledger year. */
  yearLong?: string;
  overview: string;
  collaborators: string;
  /**
   * Placeholder hue for the deck card's stripe fill, for a project whose
   * footage has not landed yet. Every project currently sets real clips, so
   * nothing sets this — it is the path a new empty project takes on the way in.
   */
  hue?: number;
  /**
   * The hero: the clip on the deck card, and the one the project page opens on
   * before the first shot.
   *
   * It is a different job from the gallery, and a clip doing this job should
   * NOT also appear in `shots`. Every project's hero was duplicated as its
   * first shot to begin with, which meant the page opened on a clip and then
   * offered the same clip again as shot one — the reader steps forward and
   * nothing has changed. Naming it here and leaving it out of the list below is
   * the whole mechanism; there is no flag to set.
   *
   * H.264 MP4 is the universal baseline and every browser we care about plays
   * it. VP9 WebM is offered first where present: it is meaningfully smaller at
   * the same quality, and it plays in Chromium builds shipped without the
   * proprietary H.264 decoder.
   */
  src?: string;
  srcWebm?: string;
  /**
   * A still of the hero, for the cards that have no <video>.
   *
   * Only the front card and its two neighbours get a real one — six
   * autoplaying clips will not hold frame rate on a phone — so without this
   * the rest of the stack fell back to the flat empty colour. That colour is
   * dark, which put a card two places back BEHIND one further away in
   * apparent depth and stopped the stack reading as ordered at all. It is
   * also handed to the <video> as its poster, so a live card shows the
   * picture rather than the empty colour while it decodes.
   *
   * Drawn by `scripts/posters.mjs`, which reads `src` above.
   */
  poster?: string;
  shots: Shot[];
};

/**
 * What a project falls back to when `content/copy.json` has nothing for it.
 *
 * Now that the copy lives in that file, these are reached only by a project
 * added before its copy is written — but they still have to be nameable.
 * `generateMetadata` recognises the overview one: a placeholder on the page is
 * obvious to anyone looking at it, while the same string in a `<meta
 * name="description">` is invisible until it turns up in a search result or a
 * shared link. The page keeps showing it — it should be conspicuous — and the
 * metadata falls back to something true.
 */
export const PLACEHOLDER_OVERVIEW = "Overview copy goes here.";
const PLACEHOLDER_COLLAB = "Name Surname, Name Surname";

/**
 * Every clip lives at `/media/<slug>/<name>.mp4`, mirroring
 * `media-source/<slug>/<name>.mp4` — `scripts/encode-media.mjs` is what turns
 * one into the other. So a shot's `src` is also the name of the export it came
 * from, and re-cutting a clip means dropping the new export in and re-running.
 *
 * One path below deliberately reaches into another project's folder. The
 * gesture work is its own project AND a shot in the Pixel overview, and it is
 * the same recording either way; pointing at the one file says so, and saves
 * shipping it twice.
 */
const structure: ProjectStructure[] = [
  {
    slug: "airbnb-reservations",
    title: "Airbnb Reservations",
    year: "2025",
    src: "/media/airbnb-reservations/reservation-detail.mp4",
    poster: "/media/airbnb-reservations/poster.jpg",
    /**
     * The native reservation detail, the avatar work underneath it, then the
     * desktop surface last. The three avatar clips are component renders
     * rather than screen captures, which is why they are wide and sit on white.
     */
    shots: [
      {
        n: "02",
        kind: "portrait",
        src: "/media/airbnb-reservations/reservation-detail.mp4",
        aspect: 0.4609,
      },
      {
        n: "03",
        kind: "landscape",
        src: "/media/airbnb-reservations/guest-avatars.mp4",
        aspect: 1.88,
      },
      {
        n: "04",
        kind: "square",
        src: "/media/airbnb-reservations/avatar-pile-studies.mp4",
        aspect: 0.752,
      },
      {
        n: "05",
        kind: "landscape",
        src: "/media/airbnb-reservations/multi-supply-avatars.mp4",
        aspect: 1.88,
      },
      {
        n: "06",
        kind: "desktop",
        src: "/media/airbnb-reservations/reservation-detail-desktop.mp4",
        aspect: 1.4063,
      },
    ],
  },
  {
    slug: "airbnb-setup",
    title: "Airbnb Setup",
    year: "2025",
    src: "/media/airbnb-setup/experience-selection.mp4",
    poster: "/media/airbnb-setup/poster.jpg",
    /**
     * Native and desktop alternating through the setup flow, then the menu
     * work, then the itinerary and the celebration it ends on.
     *
     * Two clips are deliberately not here. `experience-selection` is the hero
     * above, and showing it again as a shot made the first step of the gallery
     * a step onto the same picture. `offering-photo-selection` is cut from the
     * gallery but still encoded, so putting it back is a line rather than a
     * re-export.
     */
    shots: [
      {
        n: "02",
        kind: "portrait",
        src: "/media/airbnb-setup/service-type-selection.mp4",
        aspect: 0.4609,
      },
      {
        n: "03",
        kind: "desktop",
        src: "/media/airbnb-setup/service-type.mp4",
        aspect: 1.4063,
      },
      {
        n: "04",
        kind: "portrait",
        src: "/media/airbnb-setup/about-you-editor.mp4",
        aspect: 0.4609,
      },
      {
        n: "05",
        kind: "desktop",
        src: "/media/airbnb-setup/setup-intro.mp4",
        aspect: 1.4063,
      },
      {
        n: "06",
        kind: "landscape",
        src: "/media/airbnb-setup/menu-intro.mp4",
        aspect: 1.7778,
      },
      {
        n: "07",
        kind: "landscape",
        src: "/media/airbnb-setup/menu-group-advance.mp4",
        aspect: 1.7778,
        cut: true,
      },
      {
        n: "08",
        kind: "landscape",
        src: "/media/airbnb-setup/menu-image-fill.mp4",
        aspect: 1.7778,
        cut: true,
      },
      {
        n: "09",
        kind: "square",
        src: "/media/airbnb-setup/nav-bar-thumbnail.mp4",
        aspect: 1,
      },
      {
        n: "10",
        kind: "square",
        src: "/media/airbnb-setup/nav-bar-category.mp4",
        aspect: 1,
        cut: true,
      },
      {
        n: "11",
        kind: "portrait",
        src: "/media/airbnb-setup/add-photos.mp4",
        aspect: 0.4609,
      },
      {
        n: "12",
        kind: "desktop",
        src: "/media/airbnb-setup/add-offerings.mp4",
        aspect: 1.4063,
      },
      {
        n: "13",
        kind: "landscape",
        src: "/media/airbnb-setup/itinerary-intro.mp4",
        aspect: 1.7778,
      },
      {
        n: "14",
        kind: "landscape",
        src: "/media/airbnb-setup/celebration.mp4",
        aspect: 1.7778,
      },
    ],
  },
  {
    slug: "airbnb-listing-editor",
    title: "Airbnb Listing Editor",
    year: "2024",
    /**
     * The deck card shows the first shot's clip.
     *
     * Its folder is `mys` — Manage Your Space — rather than the slug, because
     * these landed before the per-project folders existed.
     */
    src: "/media/mys/edit-podium.mp4",
    poster: "/media/mys/poster.jpg",
    /**
     * Every `kind` here is the clip's own aspect ratio rather than a choice —
     * the frame morphs to the shape of whatever is playing in it, so a portrait
     * capture gets the phone and a desktop capture gets the window.
     */
    shots: [
      {
        n: "02",
        kind: "square",
        src: "/media/mys/ltr-overshoot-presentation.mp4",
        aspect: 1,
      },
      {
        n: "03",
        kind: "square",
        src: "/media/mys/little-people-detail-loop.mp4",
        aspect: 1,
      },
      {
        n: "04",
        kind: "landscape",
        src: "/media/mys/ml-sorting-array.mp4",
        aspect: 1.7778,
      },
      {
        n: "05",
        kind: "square",
        src: "/media/mys/ml-photo-arranging-presentation.mp4",
        aspect: 0.9643,
      },
      {
        n: "06",
        kind: "desktop",
        src: "/media/mys/photo-tour-desktop.mp4",
        aspect: 1.4015,
      },
      {
        n: "07",
        kind: "desktop",
        src: "/media/mys/panel-navigation.mp4",
        aspect: 1.4008,
      },
      {
        n: "08",
        kind: "desktop",
        src: "/media/mys/gallery-photo-view-grow.mp4",
        aspect: 1.4008,
      },
      {
        n: "09",
        kind: "portrait",
        src: "/media/mys/auto-arrange.mp4",
        aspect: 0.4621,
      },
      {
        n: "10",
        kind: "desktop",
        src: "/media/mys/auto-arrange-desktop.mp4",
        aspect: 1.4015,
      },
      {
        n: "11",
        kind: "portrait",
        src: "/media/mys/amenities-empty-state.mp4",
        aspect: 0.4621,
      },
    ],
  },
  {
    slug: "gesture-navigation",
    title: "Gesture Navigation",
    year: "2020",
    src: "/media/gesture-navigation/swipe-to-go-home.mp4",
    poster: "/media/gesture-navigation/poster.jpg",
    /**
     * The map of the gestures first, as a still, then the three system
     * gestures, then invoking the Assistant with a fourth.
     */
    shots: [
      {
        n: "02",
        // A diagram, not a screen: the softer window radius, not the phone's.
        kind: "square",
        poster: "/media/gesture-navigation/gesture-map.webp",
        aspect: 1500 / 1804,
      },
      {
        n: "03",
        kind: "pixel",
        src: "/media/gesture-navigation/swipe-to-go-home.mp4",
        // Cropped inside the screen, past its black system bars.
        aspect: 0.4965,
      },
      {
        n: "04",
        kind: "pixel",
        src: "/media/gesture-navigation/overview.mp4",
        aspect: 0.474,
      },
      {
        n: "05",
        kind: "pixel",
        src: "/media/gesture-navigation/back.mp4",
        aspect: 0.474,
      },
      {
        n: "06",
        kind: "pixel",
        src: "/media/gesture-navigation/assistant-gesture.mp4",
        // Full frame with its even 14px border kept; see the encode script.
        aspect: 0.4792,
      },
    ],
  },
  {
    slug: "google-pixel",
    /**
     * Two words, and no `displayTitle`. It carried the break for "Google Pixel
     * / & Android", and with the Android half gone there is nothing left to
     * break — the headline and the ledger row set the same one line.
     */
    title: "Google Pixel",
    /** The ledger's one year; the project page shows the whole run. */
    year: "2018",
    yearLong: "2016-2020",
    src: "/media/google-pixel/pixel-3-welcome.mp4",
    poster: "/media/google-pixel/poster.jpg",
    /**
     * The overview: the Google logo straight after the welcome, then the
     * system motion, then the two side-by-side comparisons that end on a
     * square.
     *
     * The Pixel 3 welcome is not among them. It is the hero above, and unlike
     * the rest of this footage that clip was re-exported as the screen alone
     * — no phone body drawn onto white — so it fills the deck card the way
     * every other project's hero does.
     *
     * Two more have no export at all and are gone rather than sitting there
     * as a stripe fill: a Folder Animation that was never cut, and the
     * Assistant work, which was briefly its own project and did not have the
     * footage to carry one. Its invocation clip stayed and lives here now.
     */
    shots: [
      {
        n: "02",
        kind: "landscape",
        src: "/media/google-pixel/google-to-g.mp4",
        aspect: 1.7778,
      },
      {
        n: "03",
        kind: "portrait",
        src: "/media/gesture-navigation/swipe-to-go-home.mp4",
        aspect: 0.474,
      },
      {
        n: "04",
        kind: "portrait",
        src: "/media/google-pixel/assistant-invocation.mp4",
        aspect: 0.474,
      },
      {
        n: "05",
        kind: "portrait",
        src: "/media/google-pixel/pixel-2-welcome.mp4",
        aspect: 0.474,
      },
      {
        n: "06",
        kind: "square",
        src: "/media/google-pixel/app-opening.mp4",
        aspect: 1,
      },
      {
        n: "07",
        kind: "square",
        src: "/media/google-pixel/task-switching.mp4",
        aspect: 1,
      },
    ],
  },
];

/**
 * The structure above with its writing merged in from `content/copy.json`.
 *
 * A project or shot the copy file does not know yet gets a visible stand-in
 * rather than an empty string, so a missing entry shows up on the page instead
 * of as a blank the eye slides past.
 */
export const projects: Project[] = structure.map((p) => {
  const c = copy.projects[p.slug];
  return {
    ...p,
    overview: c?.overview ?? PLACEHOLDER_OVERVIEW,
    collaborators: c?.collaborators ?? PLACEHOLDER_COLLAB,
    shots: p.shots.map((s) => {
      const key = shotKey(s.src ?? s.poster) ?? s.n;
      return { ...s, title: c?.shots[key] ?? `Untitled (${key})` };
    }),
  };
});

/**
 * The title as the HEADLINE sets it — one entry per line.
 *
 * Only the case page uses this. The ledger sets `title` straight, on one line,
 * because a break chosen for a 56px headline is not one that suits a row in a
 * list. A project without an authored break is a single line either way.
 */
export function titleLines(project: Project): readonly string[] {
  return project.displayTitle ?? [project.title];
}

/**
 * The card the deck rests on when the site first loads.
 *
 * Named by slug rather than by position, so reordering the list above cannot
 * silently change which project the site opens on — that is a decision about
 * what to lead with, not a consequence of where a project sits in a ledger.
 *
 * Set to the FIRST project in the list, and it should stay that way. When the
 * two differed, scrolling down from the hero had to turn the deck from the
 * card you landed on to the one the ledger starts on, and that turn read as
 * the page skipping.
 */
export const OPENING_SLUG = "airbnb-reservations";

/** Its index, or the first project if the slug ever stops matching. */
export function openingIndex(): number {
  return Math.max(0, projectIndex(OPENING_SLUG));
}

export function projectBySlug(slug: string) {
  return projects.find((p) => p.slug === slug);
}

export function projectIndex(slug: string) {
  return projects.findIndex((p) => p.slug === slug);
}

/**
 * The deck card's fill.
 *
 * Every project has footage now, so what this returns in practice is the empty
 * colour that shows for the moment before a clip decodes. The stripe is what a
 * project stands behind while its clips are still being cut.
 */
export function stripeFill(hue?: number) {
  if (hue === undefined) return "var(--shot-empty)";
  return `repeating-linear-gradient(135deg,oklch(0.5 0.1 ${hue}) 0 18px,oklch(0.4 0.09 ${hue}) 18px 36px)`;
}
