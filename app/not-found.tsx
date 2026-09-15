import type { Metadata } from "next";
import Link from "next/link";
import { TYPE, type as typeStyle } from "@/lib/design";

export const metadata: Metadata = {
  title: "Not found",
  /* A 404 has nothing to offer a crawler, and a soft-404 in the index is worse
   * than no entry at all. */
  robots: { index: false, follow: true },
};

/**
 * The page for a URL that isn't one.
 *
 * Deliberately not built on `Header` or the stage: those take their geometry
 * from a measured viewport and a deck that doesn't exist here. This is static
 * type on the page's own paper, which is all a dead link needs — and it is
 * what the static export writes to `out/404.html`, the file GitHub Pages
 * serves for anything it cannot find.
 */
export default function NotFound() {
  return (
    <main
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 28,
        padding: 24,
        textAlign: "center",
      }}
    >
      <p style={{ ...typeStyle(TYPE.label), margin: 0, color: "var(--ink-3)" }}>
        404
      </p>
      <h1
        style={{
          ...typeStyle(TYPE.titleL),
          margin: 0,
          color: "var(--ink)",
          textWrap: "pretty",
        }}
      >
        That page isn’t here.
      </h1>
      <Link
        href="/"
        style={{ ...typeStyle(TYPE.label), color: "var(--ink-2)" }}
      >
        ← Back to the work
      </Link>
    </main>
  );
}
