import { copy } from "./copy";

/**
 * The About page's picture and links. Its writing — the lead, the paragraphs,
 * the BASED line and the back of the print — comes from `content/copy.json`.
 */
export const about = {
  /** Under `public/`. Cropped to the print's square window, so any shape works. */
  photo: "/about/portrait.jpg",
  alt: "Remington and family walking across a footbridge over a river, in evening light",
  back: copy.about.back,
  /**
   * The same words in Remington's hand, lifted off a photo of the sheet by
   * `npm run about:back`. Delete the file to get the typed caption back.
   */
  writing: "/about/back.png",
  lead: copy.about.lead,
  body: copy.about.body,
  based: copy.about.based,
  contact: [
    { label: "Email", value: "remington@remingtonm.com", href: "mailto:remington@remingtonm.com" },
  ],
} as const;
