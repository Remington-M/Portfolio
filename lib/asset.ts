/**
 * Prefix a path into the `public` folder with the deployment's base path.
 *
 * Next rewrites its own asset URLs when `basePath` is set, but it cannot
 * rewrite a raw string handed to a `<video src>` or `<img src>` — those are
 * just data. Anything under `public` that is referenced by hand has to come
 * through here, or it 404s wherever the site is not served from the root of a
 * domain. Empty at development time, so this is a no-op locally.
 */
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/**
 * Origin the video files are actually served from, without a trailing slash.
 *
 * Clips are heavy and do not belong in the repo or in the site bundle, so in
 * production they come off object storage — an R2 bucket behind Cloudflare —
 * as plain MP4 URLs. Setting `NEXT_PUBLIC_MEDIA_BASE` at build time is the
 * whole switch; leaving it unset serves the same paths out of `public/`, which
 * is what makes local development work with files dropped straight into the
 * folder. No player, no embed, no SDK: just a different origin on the URL.
 */
const MEDIA = (process.env.NEXT_PUBLIC_MEDIA_BASE ?? "").replace(/\/+$/, "");

export function asset(path: string): string;
export function asset(path: undefined): undefined;
export function asset(path?: string): string | undefined;
export function asset(path?: string): string | undefined {
  if (!path) return path;
  return path.startsWith("/") ? `${BASE}${path}` : path;
}

/**
 * Resolve a clip's URL. Off the media origin when one is configured, out of
 * `public/` otherwise. An absolute URL in the data is left alone, so a single
 * clip can be pointed somewhere else without ceremony.
 */
export function media(path: string): string;
export function media(path: undefined): undefined;
export function media(path?: string): string | undefined;
export function media(path?: string): string | undefined {
  if (!path) return path;
  if (/^https?:\/\//i.test(path)) return path;
  if (MEDIA && path.startsWith("/")) return `${MEDIA}${path}`;
  return asset(path);
}
