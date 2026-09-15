import type { Metadata } from "next";
import About from "@/components/about/About";
import { about } from "@/lib/about";
import { absolute, site } from "@/lib/site";

/* The name comes from the root layout's title template — see the note in
 * `app/work/[slug]/page.tsx`. */
const description = about.lead;

export const metadata: Metadata = {
  title: "About",
  description,
  alternates: { canonical: "/about/" },
  openGraph: {
    type: "profile",
    siteName: site.name,
    title: `About — ${site.name}`,
    description,
    url: absolute("/about/"),
    locale: "en_US",
    images: [{ url: site.ogImage, width: 1200, height: 630, alt: site.ogImageAlt }],
  },
  twitter: {
    card: "summary_large_image",
    title: `About — ${site.name}`,
    description,
    images: [site.ogImage],
  },
};

export default function Page() {
  return <About />;
}
