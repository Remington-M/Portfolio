/**
 * The About page's copy and the Polaroid's picture.
 *
 * The first sentence is the site's own. The second paragraph is a stand-in
 * written to the right length and register so the page has its shape — it
 * is the one thing on this page still to be written for real.
 */
export const about = {
  /** Under `public/`. Cropped to the print's square window, so any shape works. */
  photo: "/about/portrait.jpg",
  alt: "Remington and family walking across a footbridge over a river, in evening light",
  /** What is written on the back of the print. First line is set as a label. */
  back: ["Remington", "San Francisco", "Summer, 2025"],
  lead:
    "Hey, I’m Remington. I’m a motion designer, and I make software feel like it was built by people who cared how it moved.",
  body: [
    "I’ve spent the last decade on product teams at Airbnb and Google, working on the moments between screens: the way a card opens, a list settles, a gesture lands. The work is in the deck. This is the rest of it.",
  ],
  based: "San Francisco",
  contact: [
    { label: "Email", value: "remington@remingtonm.com", href: "mailto:remington@remingtonm.com" },
  ],
} as const;
