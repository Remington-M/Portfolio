/**
 * The About page's copy and the Polaroid's picture.
 *
 * Placeholder throughout, in the same way the project copy is: the shape of
 * the page is real, the words are not yet. The role line lives here and
 * nowhere else — the project pages deliberately omit it, because it never
 * varies between them.
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
    "Placeholder. A paragraph or two about the work: where it started, what it is now, what motion is for. This copy exists so the page has its shape.",
    "Placeholder. Where to find me, and what I am up to next.",
  ],
  role: "Staff Motion Designer",
  based: "San Francisco",
  contact: [
    { label: "Email", value: "remington@remingtonm.com", href: "mailto:remington@remingtonm.com" },
  ],
  placeholder: true,
} as const;
