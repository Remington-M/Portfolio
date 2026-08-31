import type { ShotKind } from "./design";

export type Shot = {
  n: string;
  title: string;
  meta: string;
  kind: ShotKind;
  /**
   * The clip's true width / height.
   *
   * The viewer takes its shape from this rather than from a shape authored by
   * hand, because anything else crops: the frames were laid out as tidy
   * proportions and the footage is whatever it is, so five of these were
   * losing 12% of the picture to `object-fit: cover`.
   */
  aspect?: number;
  /** Placeholder hue for the stripe fill. Delete with the placeholders. */
  hue?: number;
  src?: string;
  srcWebm?: string;
  poster?: string;
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
   * Placeholder hue for the deck card's stripe fill. Optional because it is
   * scaffolding: a project with real footage has nothing to stand in for, and
   * setting one anyway would only paint a fill nobody ever sees.
   */
  hue?: number;
  /**
   * H.264 MP4 is the universal baseline and every browser we care about plays
   * it. VP9 WebM is offered first where present: it is meaningfully smaller at
   * the same quality, and it plays in Chromium builds shipped without the
   * proprietary H.264 decoder.
   */
  src?: string;
  srcWebm?: string;
  poster?: string;
  shots: Shot[];
};

const PLACEHOLDER_OVERVIEW = "Overview copy goes here.";
const PLACEHOLDER_COLLAB = "Name Surname, Name Surname";

/** Five blank numbered shots — the skeleton every project starts from. */
function blankShots(count = 5): Shot[] {
  return Array.from({ length: count }, (_, i) => ({
    n: String(i + 2).padStart(2, "0"),
    title: `Shot ${String(i + 1).padStart(2, "0")}`,
    meta: "TO BE POPULATED",
    kind: "portrait" as const,
  }));
}

export const projects: Project[] = [
  {
    slug: "airbnb-setup",
    title: "Airbnb Setup",
    year: "2025",
    overview: PLACEHOLDER_OVERVIEW,
    collaborators: PLACEHOLDER_COLLAB,
    hue: 30,
    src: "/media/airbnb-setup.mp4",
    /**
     * Shot 01 points at the one real clip that exists, so the per-shot video
     * path is actually exercised rather than merely written. Replace with its
     * own file — `/media/airbnb-setup-01.mp4` and so on — as they land, and
     * drop `hue` from any shot that has one, since the stripe fill is only
     * there to stand in for missing footage.
     */
    shots: blankShots().map((shot, i) =>
      i === 0 ? { ...shot, src: "/media/airbnb-setup.mp4" } : shot,
    ),
  },
  {
    slug: "airbnb-host-experience",
    title: "Airbnb Host Experience",
    year: "2025",
    overview: PLACEHOLDER_OVERVIEW,
    collaborators: PLACEHOLDER_COLLAB,
    hue: 340,
    shots: blankShots(),
  },
  {
    slug: "airbnb-listing-editor",
    title: "Airbnb Listing Editor",
    year: "2024",
    overview: PLACEHOLDER_OVERVIEW,
    collaborators: PLACEHOLDER_COLLAB,
    /**
     * No `hue`: this project has real footage, so it needs no stripe fill.
     * The deck card shows the first shot's clip.
     */
    src: "/media/mys/edit-podium.mp4",
    /**
     * Manage Your Space. Every `kind` here is the clip's own aspect ratio
     * rather than a choice — the frame morphs to the shape of whatever is
     * playing in it, so a portrait capture gets the phone and a desktop
     * capture gets the window. Titles are derived from the filenames and
     * are provisional.
     */
    shots: [
      {
        n: "02",
        title: "Panel Navigation",
        meta: "MANAGE YOUR SPACE · 5S LOOP",
        kind: "desktop",
        src: "/media/mys/panel-navigation.mp4",
        aspect: 1.4015,
      },
      {
        n: "03",
        title: "Photo Tour Desktop",
        meta: "MANAGE YOUR SPACE · 8S LOOP",
        kind: "desktop",
        src: "/media/mys/photo-tour-desktop.mp4",
        aspect: 1.4015,
      },
      {
        n: "04",
        title: "Photo Tour Room Expand",
        meta: "MANAGE YOUR SPACE · 3S LOOP",
        kind: "square",
        src: "/media/mys/photo-tour-room-expand.mp4",
        aspect: 1.0,
      },
      {
        n: "05",
        title: "Gallery Photo View Grow",
        meta: "MANAGE YOUR SPACE · 6S LOOP",
        kind: "desktop",
        src: "/media/mys/gallery-photo-view-grow.mp4",
        aspect: 1.4015,
      },
      {
        n: "06",
        title: "ML Photo Arranging Presentation",
        meta: "MANAGE YOUR SPACE · 7S LOOP",
        kind: "square",
        src: "/media/mys/ml-photo-arranging-presentation.mp4",
        aspect: 0.9643,
      },
      {
        n: "07",
        title: "ML Sorting Array",
        meta: "MANAGE YOUR SPACE · 17S LOOP",
        kind: "landscape",
        src: "/media/mys/ml-sorting-array.mp4",
        aspect: 1.7778,
      },
      {
        n: "08",
        title: "Auto Arrange",
        meta: "MANAGE YOUR SPACE · 6S LOOP",
        kind: "portrait",
        src: "/media/mys/auto-arrange.mp4",
        aspect: 0.4625,
      },
      {
        n: "09",
        title: "Auto Arrange Desktop",
        meta: "MANAGE YOUR SPACE · 6S LOOP",
        kind: "desktop",
        src: "/media/mys/auto-arrange-desktop.mp4",
        aspect: 1.4015,
      },
      {
        n: "10",
        title: "Amenities Empty State",
        meta: "MANAGE YOUR SPACE · 20S LOOP",
        kind: "portrait",
        src: "/media/mys/amenities-empty-state.mp4",
        aspect: 0.4625,
      },
      {
        n: "11",
        title: "LTR Overshoot Presentation",
        meta: "MANAGE YOUR SPACE · 3S LOOP",
        kind: "square",
        src: "/media/mys/ltr-overshoot-presentation.mp4",
        aspect: 1.0,
      },
      {
        n: "12",
        title: "Little People Detail Loop",
        meta: "MANAGE YOUR SPACE · 12S LOOP",
        kind: "square",
        src: "/media/mys/little-people-detail-loop.mp4",
        aspect: 1.0,
      },
      {
        n: "13",
        title: "Super Text",
        meta: "MANAGE YOUR SPACE · 4S LOOP",
        kind: "desktop",
        src: "/media/mys/supertext.mp4",
        aspect: 1.4015,
      },
    ],
  },
  {
    slug: "gesture-navigation",
    title: "Gesture Navigation",
    year: "2020",
    overview: PLACEHOLDER_OVERVIEW,
    collaborators: PLACEHOLDER_COLLAB,
    hue: 250,
    shots: blankShots(),
  },
  {
    slug: "the-new-google-assistant",
    title: "The New Google Assistant",
    year: "2020",
    overview: PLACEHOLDER_OVERVIEW,
    collaborators: PLACEHOLDER_COLLAB,
    hue: 200,
    shots: blankShots(),
  },
  {
    slug: "google-pixel",
    title: "Google Pixel",
    displayTitle: ["Google Pixel", "& Android"],
    year: "2018",
    yearLong: "2016 — 2020",
    overview:
      "I had the privilege to work on the Pixel 1-5. Getting to build the foundation for Google's phone with a small design team was a highlight of my career.\n\nI was responsible for core system transitions, Google Assistant & Search integrations, branded moments, core infrastructure, physics based motion and much more!",
    collaborators: "Name Surname, Name Surname, Name Surname",
    hue: 80,
    shots: [
      { n: "02", title: "Gesture Navigation", meta: "PIXEL 4 · 2019", kind: "portrait", hue: 250 },
      { n: "03", title: "Assistant Invocation", meta: "PIXEL 4 · 2019", kind: "portrait", hue: 200 },
      { n: "04", title: "Google Logo Animation", meta: "BRANDED MOMENTS", kind: "square", hue: 30 },
      { n: "05", title: "Pixel 2 Welcome", meta: "BRANDED MOMENTS", kind: "square", hue: 60 },
      { n: "06", title: "Boot Animation", meta: "BRANDED MOMENTS", kind: "landscape", hue: 30 },
      { n: "07", title: "App Opening", meta: "ANDROID P", kind: "portrait", hue: 150 },
      { n: "08", title: "Folder Animation", meta: "PIXEL LAUNCHER", kind: "desktop", hue: 300 },
      { n: "09", title: "Task Switching", meta: "ANDROID O", kind: "portrait", hue: 340 },
    ],
  },
];

export function projectBySlug(slug: string) {
  return projects.find((p) => p.slug === slug);
}

export function projectIndex(slug: string) {
  return projects.findIndex((p) => p.slug === slug);
}

/**
 * Placeholder scaffolding — a diagonal stripe fill standing in for real media.
 * Delete this and the `hue` fields when real clips land.
 */
export function stripeFill(hue?: number) {
  // Nothing to stand in for: a card with real footage gets the empty-shot
  // colour behind it, which is what shows for the moment before it decodes.
  if (hue === undefined) return "var(--shot-empty)";
  return `repeating-linear-gradient(135deg,oklch(0.5 0.1 ${hue}) 0 18px,oklch(0.4 0.09 ${hue}) 18px 36px)`;
}
