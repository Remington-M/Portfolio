import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import localFont from "next/font/local";
import { StageProvider } from "@/components/media/stage";
import { site } from "@/lib/site";
import MediaLayer from "@/components/media/MediaLayer";
import TunePanel from "@/components/TunePanel";
import "./globals.css";

/**
 * next/font downloads and self-hosts this at build time, so there is no
 * request to Google at runtime and no flash of unstyled text.
 *
 */
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

/**
 * `metadataBase` is what lets every relative URL below resolve to an absolute
 * one — Open Graph and Twitter cards are fetched by a scraper with no notion
 * of the page they came from, so a root-relative image path is useless to
 * them. It comes from `lib/site.ts` so the host is configured in one place.
 */
/**
 * Söhne, licensed from Klim and self-hosted from `app/fonts/`.
 *
 * Through `next/font` rather than a hand-written @font-face, for three
 * things a raw `url("/fonts/…")` could not do. The URL follows the base
 * path, so the face loads when the site is served from a subdirectory —
 * written by hand it 404'd on the GitHub project page and the whole site
 * fell back to system-ui. Both weights are preloaded, so the hero is not
 * set once in the fallback and again when the face lands. And the fallback
 * is metric-matched, so what little swap is left does not move the lines.
 *
 * If the files are ever missing the build fails here, loudly, rather than
 * shipping the wrong letterforms quietly.
 */
const soehne = localFont({
  src: [
    { path: "./fonts/soehne-buch.woff2", weight: "400", style: "normal" },
    { path: "./fonts/soehne-kraftig.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-soehne",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: site.title,
    /** Project and about pages set their own; this frames them. */
    template: `%s — ${site.name}`,
  },
  description: site.description,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: site.name,
    title: site.title,
    description: site.description,
    url: site.url,
    locale: "en_US",
    images: [
      {
        url: site.ogImage,
        width: 1200,
        height: 630,
        alt: site.ogImageAlt,
      },
    ],
  },
  /**
   * `summary_large_image` is the difference between the card showing the
   * sentence at full width and showing it as a thumbnail next to grey text.
   */
  twitter: {
    card: "summary_large_image",
    title: site.title,
    description: site.description,
    images: [site.ogImage],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // The stage handles its own scrolling; zooming would fight the fixed layer.
  viewportFit: "cover",
  themeColor: "#f6f3ec",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${plexMono.variable} ${soehne.variable}`}>
      <body>
        <StageProvider>
          {children}
          {/*
            The media layer lives in the layout, not in either page, because an
            App Router layout persists across navigations between its children.
            That persistence is what keeps a playing video alive from the home
            deck through to a project page — the element is never remounted.
          */}
          <MediaLayer />
          {/*
            Motion tuning, off unless asked for — `?tune` on any URL, or the
            T key. Renders nothing at all otherwise.
          */}
          <TunePanel />
        </StageProvider>
      </body>
    </html>
  );
}
