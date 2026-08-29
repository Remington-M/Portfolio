import type { Metadata, Viewport } from "next";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import { StageProvider } from "@/components/media/stage";
import MediaLayer from "@/components/media/MediaLayer";
import "./globals.css";

/**
 * next/font downloads and self-hosts these at build time, so there is no
 * request to Google at runtime and no flash of unstyled text.
 */
const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-archivo",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Remington McElhaney — Motion Design",
  description:
    "Hey, I'm Remington and I make software come to life with motion.",
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
    <html lang="en" className={`${archivo.variable} ${plexMono.variable}`}>
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
        </StageProvider>
      </body>
    </html>
  );
}
