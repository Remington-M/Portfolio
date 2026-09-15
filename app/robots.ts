import type { MetadataRoute } from "next";
import { absolute } from "@/lib/site";

/**
 * `output: export` refuses to prerender a route handler unless it is told the
 * route is static. Nothing here reads a request, so it always was.
 */
export const dynamic = "force-static";


/**
 * Next writes this out as a static `robots.txt` at build time, so it survives
 * the static export with no server behind it.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: absolute("/sitemap.xml"),
  };
}
