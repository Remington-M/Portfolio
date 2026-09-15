/**
 * Where the site lives, and the handful of strings that describe it.
 *
 * Everything that has to name the site absolutely — canonical links, Open
 * Graph tags, the sitemap — reads from here rather than hardcoding a host, so
 * moving the site is a matter of changing one environment variable at build
 * time rather than hunting for URLs.
 *
 * `NEXT_PUBLIC_SITE_URL` is set by the deploy workflow. The fallback is the
 * GitHub Pages project URL, which is where the site sits until the custom
 * domain is switched on — so a build with nothing configured still produces
 * correct absolute URLs rather than `undefined` in a meta tag.
 */
const FALLBACK = "https://remington-m.github.io/Portfolio";

/** No trailing slash, ever — everything here appends its own leading one. */
export const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || FALLBACK).replace(
  /\/+$/,
  "",
);

export const site = {
  url: siteUrl,
  name: "Remington McElhaney",
  title: "Remington McElhaney — Motion Design",
  /**
   * The same sentence the hero types out. A link preview that says what the
   * page says is one less thing to keep in sync by hand.
   */
  description:
    "Hey, I’m Remington and I make software come to life with motion.",
  /**
   * Sized 1200x630 — the ratio Open Graph, LinkedIn, Slack and iMessage all
   * agree on. Regenerate with `npm run og` after changing the source.
   */
  ogImage: "/og.jpg",
  ogImageAlt:
    "Remington McElhaney — motion design. Airbnb, Google, and the work in between.",
} as const;

/** Absolute URL for a path under the site root. */
export function absolute(path: string): string {
  return `${siteUrl}${path.startsWith("/") ? path : `/${path}`}`;
}
