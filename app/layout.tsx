import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import { StageProvider } from "@/components/media/stage";
import MediaLayer from "@/components/media/MediaLayer";
import TunePanel from "@/components/TunePanel";
import "./globals.css";

/**
 * next/font downloads and self-hosts this at build time, so there is no
 * request to Google at runtime and no flash of unstyled text.
 *
 * The sans is not here: Söhne is licensed and self-hosted from
 * `public/fonts/`, declared as @font-face in `globals.css`. Archivo used to
 * be loaded here and is gone.
 */
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Remington McElhaney — Motion Design",
  description:
    "Hey, I\u2019m Remington and I make software come to life with motion.",
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
    <html lang="en" className={plexMono.variable}>
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
