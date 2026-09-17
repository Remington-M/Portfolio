import raw from "@/content/copy.json";

/**
 * Every piece of writing on the site that is not structural: project
 * overviews and collaborator lines, the title under each shot, and the About
 * page's paragraphs.
 *
 * It lives in `content/copy.json` rather than beside the data it decorates so
 * it can be edited without touching code — `npm run copy` opens a local editor
 * that writes straight back to the file, and the dev server picks the change
 * up on save. The code files keep the structure: which clips, in what order,
 * at what shape.
 *
 * Shot titles are keyed by the clip's file name (`reservation-detail` for
 * `/media/airbnb-reservations/reservation-detail.mp4`), and a shot with no
 * clip by its poster's. That survives reordering, which a number would not.
 */
export type ProjectCopy = {
  overview: string;
  collaborators: string;
  shots: Record<string, string>;
};

export type AboutCopy = {
  lead: string;
  body: string[];
  based: string;
  back: string[];
};

export type Copy = {
  projects: Record<string, ProjectCopy>;
  about: AboutCopy;
};

export const copy: Copy = raw;

/** `/media/x/reservation-detail.mp4` → `reservation-detail`. */
export function shotKey(path: string | undefined): string | undefined {
  if (!path) return undefined;
  const file = path.slice(path.lastIndexOf("/") + 1);
  const dot = file.lastIndexOf(".");
  return dot > 0 ? file.slice(0, dot) : file;
}
