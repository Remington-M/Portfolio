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

export function asset(path: string): string;
export function asset(path: undefined): undefined;
export function asset(path?: string): string | undefined;
export function asset(path?: string): string | undefined {
  if (!path) return path;
  return path.startsWith("/") ? `${BASE}${path}` : path;
}
