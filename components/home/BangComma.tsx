"use client";

import {
  forwardRef,
  useImperativeHandle,
  useRef,
  type CSSProperties,
} from "react";
import { animate, motionValue, useAnimationFrame } from "motion/react";
import { HERO_INTRO } from "@/lib/design";

/**
 * The exclamation point that becomes the comma, as paths — Söhne Buch's
 * own outlines, in its own units (1000 to the em, y up, baseline at 0),
 * taken from the font file so the mark is the face's mark.
 *
 * Söhne's marks are square. The dot is a 114-wide box sitting on the
 * baseline; the stem is a flat-topped taper, wider at the cap height than
 * at its foot, with a gap above the dot; the comma is the dot with a tail
 * swept down and to the left off its bottom edge.
 *
 * The STEM's top edge is a live number: at the cap height when resting,
 * above it at the top of the rise, and down at its foot when collapsed.
 * Its sides follow the glyph's own taper line, so a taller stem is the
 * same stem, extended. The DOT and the COMMA share one command structure —
 * the dot is simply the comma with its tail folded up flat into the bottom
 * edge — so one turns into the other by sliding every point, and the tail
 * grows out of the square rather than appearing beside it.
 */

/* Söhne Buch, font units. */
const ADVANCE = 222;
const CAP = 718;
/** The stem's foot and its half-widths at foot and cap. */
const FOOT = 213;
const FOOT_HW = 33.5;
const CAP_HW = 56.5;
const CX = 111.5;
/** How far the drawing box reaches below the baseline: the comma's tail. */
const BELOW = 140;

/**
 * Comma, as a flat list of points in the order the path visits them:
 * M p0, L p1, L p2, L p3, Q p4 p5, Q p6 p7, L p8, Q p9 p10, L p11, Z.
 */
const COMMA: readonly (readonly [number, number])[] = [
  [54, 0], [54, 118], [168, 118], [168, -6],
  [168, -64], [133, -97.5],
  [98, -131], [38, -133],
  [38, -81],
  [106, -78], [106, -8],
  [106, 0],
];
/** The dot: the same points with the tail laid flat along the bottom edge. */
const DOT: readonly (readonly [number, number])[] = [
  [54, 0], [54, 118], [168, 118], [168, 0],
  [168, 0], [140, 0],
  [118, 0], [100, 0],
  [100, 0],
  [106, 0], [106, 0],
  [106, 0],
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function ringPath(m: number, squash: number, scale: number): string {
  /* Squash and scale about the middle of the dot's base, on the baseline;
   * then flip y, since the font is y-up and SVG is y-down. */
  const P = (i: number) => {
    const x = CX + (lerp(DOT[i][0], COMMA[i][0], m) - CX) * scale;
    const y = lerp(DOT[i][1], COMMA[i][1], m) * scale * squash;
    return `${x.toFixed(1)} ${(-y).toFixed(1)}`;
  };
  return (
    `M ${P(0)} L ${P(1)} L ${P(2)} L ${P(3)}` +
    ` Q ${P(4)} ${P(5)} Q ${P(6)} ${P(7)} L ${P(8)}` +
    ` Q ${P(9)} ${P(10)} L ${P(11)} Z`
  );
}

/** Half-width of the stem at height `y`, on the glyph's taper line. */
const stemHW = (y: number) => FOOT_HW + ((y - FOOT) / (CAP - FOOT)) * (CAP_HW - FOOT_HW);

function stemPath(top: number): string {
  const t = Math.max(top, FOOT + 1);
  const hw = stemHW(t);
  return (
    `M ${(CX - FOOT_HW).toFixed(1)} ${-FOOT}` +
    ` L ${(CX - hw).toFixed(1)} ${(-t).toFixed(1)}` +
    ` L ${(CX + hw).toFixed(1)} ${(-t).toFixed(1)}` +
    ` L ${(CX + FOOT_HW).toFixed(1)} ${-FOOT} Z`
  );
}

export type BangCommaHandle = {
  /** Play the whole thing. Resolves when the comma has settled. */
  play: () => Promise<void>;
  /** Seconds from the start of `play` to the moment the collapse lands. */
  landsAt: number;
};

const B = HERO_INTRO.bang;
const LANDS_AT = B.rise + B.drift + B.collapse;

const BangComma = forwardRef<
  BangCommaHandle,
  {
    style?: CSSProperties;
    /** True when the mark is going to be played: it starts blank. Otherwise
     *  it rests as the comma from the first frame. */
    armed?: boolean;
  }
>(
  function BangComma({ style, armed = false }, ref) {
    const stem = useRef<SVGPathElement>(null);
    const dot = useRef<SVGPathElement>(null);

    /* The live numbers. Resting state is the finished comma. */
    const group = useRef<SVGGElement>(null);
    const top = useRef(motionValue(FOOT));
    /** Whole-mark offset (font units, y up) and fade, for the entrance. */
    const lift = useRef(motionValue(0));
    const fade = useRef(motionValue(armed ? 0 : 1));
    const squash = useRef(motionValue(1));
    const morph = useRef(motionValue(armed ? 0 : 1));
    const playing = useRef(false);
    const dirty = useRef(true);

    const paint = () => {
      if (!stem.current || !dot.current || !group.current) return;
      group.current.setAttribute(
        "transform",
        `translate(0 ${(-lift.current.get()).toFixed(1)})`,
      );
      group.current.style.opacity = fade.current.get().toFixed(3);
      const t = top.current.get();
      stem.current.setAttribute("d", stemPath(t));
      stem.current.style.opacity = t > FOOT + 1 ? "1" : "0";
      dot.current.setAttribute(
        "d",
        ringPath(morph.current.get(), squash.current.get(), 1),
      );
    };

    useAnimationFrame(() => {
      if (!playing.current && !dirty.current) return;
      dirty.current = false;
      paint();
    });

    useImperativeHandle(ref, () => ({
      landsAt: LANDS_AT,
      play: async () => {
        playing.current = true;
        top.current.set(FOOT);
        lift.current.set(-B.from * 1000);
        fade.current.set(0);
        squash.current.set(1);
        morph.current.set(0);

        const peak = CAP + B.overshoot * 1000;
        const restAbove = CAP + B.overshoot * B.driftRest * 1000;

        /* Whole, from below: fading up as it rises. */
        animate(fade.current, 1, { duration: B.fade, ease: "easeOut" });
        animate(lift.current, 0, { duration: B.rise, ease: [0.2, 0.9, 0.2, 1] });
        /* The open: from the dot to past full height in one quick move that
         * spends most of its time near the top. */
        await animate(top.current, peak, {
          duration: B.rise,
          ease: [0.3, 0.95, 0.2, 1],
        });
        /* A moment's ease at the top, still moving. */
        await animate(top.current, restAbove, {
          duration: B.drift,
          ease: [0.4, 0, 0.6, 1],
        });
        /* Collapse: the stem drives down into the dot, which takes the hit. */
        animate(squash.current, [1, 1, 0.62], {
          duration: B.collapse,
          times: [0, 0.6, 1],
          ease: "easeIn",
        });
        await animate(top.current, FOOT, {
          duration: B.collapse,
          ease: [0.7, 0, 1, 0.6],
        });
        /* The dot becomes the comma on the momentum, overshoots, springs back. */
        animate(squash.current, [0.62, 1.06, 1], {
          duration: B.morphOut + B.morphBack,
          times: [0, 0.4, 1],
          ease: ["easeOut", "easeInOut"],
        });
        await animate(morph.current, [0, B.morphOvershoot, 1], {
          duration: B.morphOut + B.morphBack,
          times: [0, B.morphOut / (B.morphOut + B.morphBack), 1],
          ease: [[0.2, 0.9, 0.3, 1], [0.4, 0, 0.3, 1]],
        });
        playing.current = false;
        dirty.current = true;
      },
    }));

    return (
      <svg
        viewBox={`0 ${-CAP} ${ADVANCE} ${CAP + BELOW}`}
        aria-hidden
        style={{
          display: "inline-block",
          width: `${ADVANCE / 1000}em`,
          height: `${(CAP + BELOW) / 1000}em`,
          /* The box's bottom edge is the tail's reach below the baseline. */
          verticalAlign: `${-BELOW / 1000}em`,
          overflow: "visible",
          ...style,
        }}
      >
        <g ref={group} style={{ opacity: armed ? 0 : 1 }}>
          <path ref={stem} fill="currentColor" d={stemPath(FOOT)} style={{ opacity: 0 }} />
          <path ref={dot} fill="currentColor" d={ringPath(armed ? 0 : 1, 1, 1)} />
        </g>
      </svg>
    );
  },
);

export default BangComma;
