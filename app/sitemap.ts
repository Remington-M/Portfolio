import type { MetadataRoute } from "next";
import { projects } from "@/lib/projects";
import { absolute } from "@/lib/site";

/**
 * `output: export` refuses to prerender a route handler unless it is told the
 * route is static. Nothing here reads a request, so it always was.
 */
export const dynamic = "force-static";


/**
 * Every route the site has: home, about, and one page per project. The list is
 * derived from `projects` rather than written out, so adding a case study adds
 * its sitemap entry too.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: absolute("/"), priority: 1 },
    { url: absolute("/about/"), priority: 0.8 },
    ...projects.map((p) => ({
      url: absolute(`/work/${p.slug}/`),
      priority: 0.6,
    })),
  ];
}
