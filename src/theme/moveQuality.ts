import { oklch } from '@reactive/silk-core/color';

import type { ReviewQuality } from '@/analysis/quality';

// How each move label looks: a colored disc with a white glyph, drawn in the
// scoresheet (QualityBadge) and on the board (Board.tsx, in a web view on
// Android, which is why this file imports only `@reactive/silk-core/color`, which
// imports nothing).
// Greens for good moves, then gold, orange and red as the loss grows, as
// chess.com and lichess color them; teal and blue for the review's Brilliant
// and Great, magenta for its Miss, and violet for an opportunity's move.
// Each disc holds its white glyph at 3:1 or more.

/** The badge's box: a 24 by 24 square, holding a disc of radius 12. */
export const BADGE_BOX = 24;
/** Every glyph's color. */
const GLYPH_INK = oklch(1, 0, 0);

/** A glyph's path, and whether it's filled (the star) or stroked. */
interface QualityGlyph {
  readonly d: string;
  readonly filled?: boolean;
}

interface QualityLook {
  /** What the label is called, for screen readers. */
  readonly name: string;
  /** Its name in a word, where a list of labels names each: the review's tally. */
  readonly short: string;
  readonly color: string;
  readonly glyph: QualityGlyph;
}

/** A question mark centered on `x`, `scale` times the full size. */
const question = (x: number, scale = 1) => {
  const s = (n: number) => +(n * scale).toFixed(2);
  return (
    `M${x - s(3)} ${12 - s(3.4)} a${s(3)} ${s(3)} 0 1 1 ${s(4.2)} ${s(2.75)} ` +
    `c${-s(0.8)} ${s(0.4)} ${-s(1.2)} ${s(1)} ${-s(1.2)} ${s(1.9)} v${s(0.5)} ` +
    `M${x} ${12 + s(5.4)} v0.01`
  );
};

/** An exclamation mark centered on `x`. */
const exclamation = (x: number) => `M${x} 6.6 v6.4 M${x} 17.4 v0.01`;

export const qualityLooks: Readonly<Record<ReviewQuality, QualityLook>> = {
  brilliant: {
    name: 'Brilliant move',
    short: 'Brilliant',
    color: oklch(0.628, 0.105, 194.8),
    glyph: { d: `${exclamation(8.8)} ${exclamation(15.2)}` },
  },
  great: {
    name: 'Great move',
    short: 'Great',
    color: oklch(0.587, 0.125, 252.2),
    glyph: { d: exclamation(12) },
  },
  book: {
    name: 'Book move',
    short: 'Book',
    color: oklch(0.59, 0.07, 66),
    glyph: {
      d:
        'M5.5 8.2c2.2-1 4.4-.9 6.5.7 2.1-1.6 4.3-1.7 6.5-.7v8.6c-2.2-1-4.4-.9-6.5.7' +
        '-2.1-1.6-4.3-1.7-6.5-.7zM12 8.9v8.6',
    },
  },
  // Violet, between the review's blue and magenta, so it reads as neither the
  // guide's book nor a grade; its glyph is the finder's magnifier.
  opportunity: {
    name: 'Opportunity move',
    short: 'Opportunity',
    color: oklch(0.56, 0.13, 300),
    glyph: { d: 'M14.7 10.5a4.2 4.2 0 1 1-8.4 0a4.2 4.2 0 1 1 8.4 0M13.6 13.6l4 4' },
  },
  best: {
    name: 'Best move',
    short: 'Best',
    color: oklch(0.587, 0.1299, 158.8),
    glyph: {
      d: 'M12 5.6L13.7 10.25L18.66 10.44L14.76 13.5L16.11 18.26L12 15.5L7.89 18.26L9.24 13.5L5.34 10.44L10.3 10.25Z',
      filled: true,
    },
  },
  good: {
    name: 'Good move',
    short: 'Good',
    color: oklch(0.59, 0.038, 149),
    glyph: { d: 'M7.2 12.4l3.3 3.4 6.3-7.2' },
  },
  inaccuracy: {
    name: 'Inaccuracy',
    short: 'Inaccuracy',
    color: oklch(0.649, 0.1276, 79),
    glyph: { d: `${question(9.6, 0.85)} ${exclamation(16.4)}` },
  },
  mistake: {
    name: 'Mistake',
    short: 'Mistake',
    color: oklch(0.606, 0.151, 47.7),
    glyph: { d: question(12) },
  },
  blunder: {
    name: 'Blunder',
    short: 'Blunder',
    color: oklch(0.553, 0.189, 22),
    glyph: { d: `${question(8.4, 0.85)} ${question(15.6, 0.85)}` },
  },
  miss: {
    name: 'Missed chance',
    short: 'Miss',
    color: oklch(0.56, 0.152, 354.3),
    glyph: { d: 'M8 8l8 8M16 8l-8 8' },
  },
};

/**
 * A label's badge as SVG markup, drawn in a BADGE_BOX square, so the
 * scoresheet (React Native) and the board (a web view's DOM) draw the same
 * thing. `ring` outlines the disc, to set it off from what's behind it.
 */
export function badgeMarkup(quality: ReviewQuality, ring?: string): string {
  const { color, glyph } = qualityLooks[quality];
  const paint = glyph.filled
    ? `fill="${GLYPH_INK}"`
    : `fill="none" stroke="${GLYPH_INK}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"`;
  const outline = ring ? ` stroke="${ring}" stroke-width="1.5"` : '';
  return `<circle cx="12" cy="12" r="${ring ? 11.25 : 12}" fill="${color}"${outline}/><path d="${glyph.d}" ${paint}/>`;
}
