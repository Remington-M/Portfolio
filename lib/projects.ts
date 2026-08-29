import type { ShotKind } from "./design";

export type Shot = {
  n: string;
  title: string;
  meta: string;
  kind: ShotKind;
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
  /** Placeholder hue for the deck card. Delete when real clips land. */
  hue: number;
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
    shots: blankShots(),
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
    hue: 300,
    shots: blankShots(),
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
export function stripeFill(hue: number) {
  return `repeating-linear-gradient(135deg,oklch(0.5 0.1 ${hue}) 0 18px,oklch(0.4 0.09 ${hue}) 18px 36px)`;
}
