import type { ShotKind } from "./design";

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
   * Placeholder hue for the deck card's stripe fill, for a project whose
   * footage has not landed yet. Every project currently sets real clips, so
   * nothing sets this — it is the path a new empty project takes on the way in.
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

/**
 * Every clip lives at `/media/<slug>/<name>.mp4`, mirroring
 * `media-source/<slug>/<name>.mp4` — `scripts/encode-media.mjs` is what turns
 * one into the other. So a shot's `src` is also the name of the export it came
 * from, and re-cutting a clip means dropping the new export in and re-running.
 *
 * Two paths below deliberately reach into another project's folder. The
 * gesture work and the Assistant invocation are their own projects AND shots
 * in the Pixel overview, and they are the same recording either way; pointing
 * at the one file says so, and saves shipping it twice.
 */
export const projects: Project[] = [
  {
    slug: "airbnb-setup",
    title: "Airbnb Setup",
    year: "2025",
    overview: PLACEHOLDER_OVERVIEW,
    collaborators: PLACEHOLDER_COLLAB,
    src: "/media/airbnb-setup/experience-selection.mp4",
    /**
     * The onboarding flow, in the order a host walks it: pick what you offer,
     * say who you are, build the offering, then the photos and the menu that
     * dress it. Desktop and native alternate because the flow itself does.
     */
    shots: [
      {
        n: "02",
        title: "Setup Intro",
        kind: "desktop",
        src: "/media/airbnb-setup/setup-intro.mp4",
        aspect: 1.4063,
      },
      {
        n: "03",
        title: "Menu Intro",
        kind: "landscape",
        src: "/media/airbnb-setup/menu-intro.mp4",
        aspect: 1.7778,
      },
      {
        n: "04",
        title: "Service Type",
        kind: "desktop",
        src: "/media/airbnb-setup/service-type.mp4",
        aspect: 1.4063,
      },
      {
        n: "05",
        title: "Service Type Selection",
        kind: "portrait",
        src: "/media/airbnb-setup/service-type-selection.mp4",
        aspect: 0.4609,
      },
      {
        n: "06",
        title: "Experience Selection",
        kind: "portrait",
        src: "/media/airbnb-setup/experience-selection.mp4",
        aspect: 0.4609,
      },
      {
        n: "07",
        title: "About You Editor",
        kind: "portrait",
        src: "/media/airbnb-setup/about-you-editor.mp4",
        aspect: 0.4609,
      },
      {
        n: "08",
        title: "Add Offerings",
        kind: "desktop",
        src: "/media/airbnb-setup/add-offerings.mp4",
        aspect: 1.4063,
      },
      {
        n: "09",
        title: "Offering Photo Selection",
        kind: "desktop",
        src: "/media/airbnb-setup/offering-photo-selection.mp4",
        aspect: 1.4063,
      },
      {
        n: "10",
        title: "Menu Group Advance",
        kind: "landscape",
        src: "/media/airbnb-setup/menu-group-advance.mp4",
        aspect: 1.7778,
      },
      {
        n: "11",
        title: "Menu Image Fill",
        kind: "landscape",
        src: "/media/airbnb-setup/menu-image-fill.mp4",
        aspect: 1.7778,
      },
      {
        n: "12",
        title: "Add Photos",
        kind: "portrait",
        src: "/media/airbnb-setup/add-photos.mp4",
        aspect: 0.4609,
      },
      {
        n: "13",
        title: "Nav Bar Thumbnail",
        kind: "square",
        src: "/media/airbnb-setup/nav-bar-thumbnail.mp4",
        aspect: 1,
      },
      {
        n: "14",
        title: "Nav Bar Category",
        kind: "square",
        src: "/media/airbnb-setup/nav-bar-category.mp4",
        aspect: 1,
      },
      {
        n: "15",
        title: "Itinerary Intro",
        kind: "landscape",
        src: "/media/airbnb-setup/itinerary-intro.mp4",
        aspect: 1.7778,
      },
      {
        n: "16",
        title: "Celebration",
        kind: "landscape",
        src: "/media/airbnb-setup/celebration.mp4",
        aspect: 1.7778,
      },
    ],
  },
  {
    slug: "airbnb-host-experience",
    title: "Airbnb Host Experience",
    year: "2025",
    overview: PLACEHOLDER_OVERVIEW,
    collaborators: PLACEHOLDER_COLLAB,
    src: "/media/airbnb-host-experience/reservation-detail.mp4",
    /**
     * Reservation details on both surfaces, then the avatar work underneath
     * them. The last three are component renders rather than screen captures,
     * which is why they are wide and sit on white.
     */
    shots: [
      {
        n: "02",
        title: "Reservation Detail",
        kind: "portrait",
        src: "/media/airbnb-host-experience/reservation-detail.mp4",
        aspect: 0.4609,
      },
      {
        n: "03",
        title: "Reservation Detail Desktop",
        kind: "desktop",
        src: "/media/airbnb-host-experience/reservation-detail-desktop.mp4",
        aspect: 1.4063,
      },
      {
        n: "04",
        title: "Guest Avatars",
        kind: "landscape",
        src: "/media/airbnb-host-experience/guest-avatars.mp4",
        aspect: 1.88,
      },
      {
        n: "05",
        title: "Multi-Supply Avatars",
        kind: "landscape",
        src: "/media/airbnb-host-experience/multi-supply-avatars.mp4",
        aspect: 1.88,
      },
      {
        n: "06",
        title: "Avatar Pile Studies",
        kind: "square",
        src: "/media/airbnb-host-experience/avatar-pile-studies.mp4",
        aspect: 0.752,
      },
    ],
  },
  {
    slug: "airbnb-listing-editor",
    title: "Airbnb Listing Editor",
    year: "2024",
    overview: PLACEHOLDER_OVERVIEW,
    collaborators: PLACEHOLDER_COLLAB,
    /**
     * The deck card shows the first shot's clip.
     *
     * Its folder is `mys` — Manage Your Space — rather than the slug, because
     * these landed before the per-project folders existed.
     */
    src: "/media/mys/edit-podium.mp4",
    /**
     * Every `kind` here is the clip's own aspect ratio rather than a choice —
     * the frame morphs to the shape of whatever is playing in it, so a portrait
     * capture gets the phone and a desktop capture gets the window.
     */
    shots: [
      {
        n: "02",
        title: "Panel Navigation",
        kind: "desktop",
        src: "/media/mys/panel-navigation.mp4",
        aspect: 1.4008,
      },
      {
        n: "03",
        title: "Photo Tour Desktop",
        kind: "desktop",
        src: "/media/mys/photo-tour-desktop.mp4",
        aspect: 1.4015,
      },
      {
        n: "04",
        title: "Photo Tour Room Expand",
        kind: "square",
        src: "/media/mys/photo-tour-room-expand.mp4",
        aspect: 1,
      },
      {
        n: "05",
        title: "Gallery Photo View Grow",
        kind: "desktop",
        src: "/media/mys/gallery-photo-view-grow.mp4",
        aspect: 1.4008,
      },
      {
        n: "06",
        title: "ML Photo Arranging Presentation",
        kind: "square",
        src: "/media/mys/ml-photo-arranging-presentation.mp4",
        aspect: 0.9643,
      },
      {
        n: "07",
        title: "ML Sorting Array",
        kind: "landscape",
        src: "/media/mys/ml-sorting-array.mp4",
        aspect: 1.7778,
      },
      {
        n: "08",
        title: "Auto Arrange",
        kind: "portrait",
        src: "/media/mys/auto-arrange.mp4",
        aspect: 0.4621,
      },
      {
        n: "09",
        title: "Auto Arrange Desktop",
        kind: "desktop",
        src: "/media/mys/auto-arrange-desktop.mp4",
        aspect: 1.4015,
      },
      {
        n: "10",
        title: "Amenities Empty State",
        kind: "portrait",
        src: "/media/mys/amenities-empty-state.mp4",
        aspect: 0.4621,
      },
      {
        n: "11",
        title: "LTR Overshoot Presentation",
        kind: "square",
        src: "/media/mys/ltr-overshoot-presentation.mp4",
        aspect: 1,
      },
      {
        n: "12",
        title: "Little People Detail Loop",
        kind: "square",
        src: "/media/mys/little-people-detail-loop.mp4",
        aspect: 1,
      },
      {
        n: "13",
        title: "Super Text",
        kind: "desktop",
        src: "/media/mys/supertext.mp4",
        aspect: 1.4008,
      },
    ],
  },
  {
    slug: "gesture-navigation",
    title: "Gesture Navigation",
    year: "2020",
    overview: PLACEHOLDER_OVERVIEW,
    collaborators: PLACEHOLDER_COLLAB,
    src: "/media/gesture-navigation/swipe-to-go-home.mp4",
    /** The three system gestures, then invoking the Assistant with a fourth. */
    shots: [
      {
        n: "02",
        title: "Swipe to Go Home",
        kind: "portrait",
        src: "/media/gesture-navigation/swipe-to-go-home.mp4",
        aspect: 0.474,
      },
      {
        n: "03",
        title: "Back",
        kind: "portrait",
        src: "/media/gesture-navigation/back.mp4",
        aspect: 0.474,
      },
      {
        n: "04",
        title: "Overview",
        kind: "portrait",
        src: "/media/gesture-navigation/overview.mp4",
        aspect: 0.474,
      },
      {
        n: "05",
        title: "Assistant Gesture",
        kind: "portrait",
        src: "/media/gesture-navigation/assistant-gesture.mp4",
        aspect: 0.474,
      },
    ],
  },
  {
    slug: "the-new-google-assistant",
    title: "The New Google Assistant",
    year: "2020",
    overview: PLACEHOLDER_OVERVIEW,
    collaborators: PLACEHOLDER_COLLAB,
    src: "/media/the-new-google-assistant/assistant-invocation.mp4",
    shots: [
      {
        n: "02",
        title: "Assistant Invocation",
        kind: "portrait",
        src: "/media/the-new-google-assistant/assistant-invocation.mp4",
        aspect: 0.474,
      },
      {
        n: "03",
        title: "Assistant Gesture",
        kind: "portrait",
        src: "/media/gesture-navigation/assistant-gesture.mp4",
        aspect: 0.474,
      },
    ],
  },
  {
    slug: "google-pixel",
    title: "Google Pixel & Android",
    /**
     * The headline sets this on two lines; the ledger sets `title` on one.
     *
     * They are allowed to differ. A break that suits a 56px headline in a
     * 470px column is not the break that suits a 28px row in a list, and
     * forcing them to agree made the ledger row twice the height of every
     * other one.
     */
    displayTitle: ["Google Pixel", "& Android"],
    /**
     * One date string, used by the ledger, the kicker, the YEAR field and the
     * page <title>.
     */
    year: "2016–2020",
    yearLong: "2016–2020",
    overview:
      "I had the privilege to work on the Pixel 1–5. Getting to build the foundation for Google’s phone with a small design team was a highlight of my career.\n\nI was responsible for core system transitions, Google Assistant & Search integrations, branded moments, core infrastructure, physics based motion and much more!",
    collaborators: "Name Surname, Name Surname, Name Surname",
    src: "/media/google-pixel/pixel-3-welcome.mp4",
    /**
     * The overview: system motion first, then the branded moments, then the
     * two side-by-side comparisons that end on a square.
     *
     * The old list carried a Folder Animation shot that no export exists for,
     * so it is gone rather than sitting there as a stripe fill.
     */
    shots: [
      {
        n: "02",
        title: "Gesture Navigation",
        kind: "portrait",
        src: "/media/gesture-navigation/swipe-to-go-home.mp4",
        aspect: 0.474,
      },
      {
        n: "03",
        title: "Assistant Invocation",
        kind: "portrait",
        src: "/media/the-new-google-assistant/assistant-invocation.mp4",
        aspect: 0.474,
      },
      {
        n: "04",
        title: "Google Logo Animation",
        kind: "landscape",
        src: "/media/google-pixel/google-to-g.mp4",
        aspect: 1.7778,
      },
      {
        n: "05",
        title: "Pixel 2 Welcome",
        kind: "portrait",
        src: "/media/google-pixel/pixel-2-welcome.mp4",
        aspect: 0.474,
      },
      {
        n: "06",
        title: "Pixel 3 Welcome",
        kind: "portrait",
        src: "/media/google-pixel/pixel-3-welcome.mp4",
        aspect: 0.474,
      },
      {
        n: "07",
        title: "Boot Animation",
        kind: "portrait",
        src: "/media/google-pixel/boot-animation.mp4",
        aspect: 0.4776,
      },
      {
        n: "08",
        title: "App Opening",
        kind: "square",
        src: "/media/google-pixel/app-opening.mp4",
        aspect: 1,
      },
      {
        n: "09",
        title: "Task Switching",
        kind: "square",
        src: "/media/google-pixel/task-switching.mp4",
        aspect: 1,
      },
    ],
  },
];

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
