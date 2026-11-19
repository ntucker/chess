// Turns the board's drawings into what chessground and the board's CSS draw.
// Pure, so it's tested without a DOM. Imports only files that import nothing,
// since the board runs in a web view on Android.
import type { DrawBrush, DrawShape } from '@lichess-org/chessground/draw';
import type { Key } from '@lichess-org/chessground/types';

import type { MoveQuality } from '@/analysis/quality';
import { type Drawing, type Square, TONES, type Tone } from '@/board/drawing';
import type { Color } from '@/game/replay';
import { toneColors } from '@/theme/drawingTones';
import { BADGE_BOX, badgeMarkup, qualityLooks } from '@/theme/moveQuality';
import { pieceColors } from '@/theme/pieceColors';

/** What the board shows for a list of drawings. */
export interface BoardMarks {
  /** Chessground's shapes: arrows, rings, ghosts, and SVG for the rest. */
  readonly shapes: DrawShape[];
  /** A CSS class for each tinted square (Board.css colors them). */
  readonly tints: Map<Key, string>;
  /** The glow color of each lit piece, by its square. */
  readonly glows: Map<Key, string>;
  /** When pieces fade, the squares of those that don't; otherwise undefined. */
  readonly unfaded?: ReadonlySet<Key>;
}

/** A tone's dashed brush; Board.css dashes arrows by this name. */
const dashedBrush = (tone: Tone) => `${tone}-dashed`;

/**
 * Chessground's brush for each tone, solid and dashed. Chessground can't dash
 * an arrow, so a dashed brush is the same color under another name, and
 * Board.css dashes the arrows that use it.
 */
export const toneBrushes: Record<string, DrawBrush> = Object.fromEntries(
  TONES.flatMap((tone) => [tone, dashedBrush(tone)].map((key): [string, DrawBrush] => [key, brush(key, tone)])),
);

function brush(key: string, tone: Tone): DrawBrush {
  return { key, color: toneColors[tone], opacity: 1, lineWidth: 10 };
}

/** How `drawings` look on a board seen from `orientation`'s side. */
export function boardMarks(drawings: readonly Drawing[], orientation: Color): BoardMarks {
  const shapes: DrawShape[] = [];
  const tints = new Map<Key, string>();
  const glows = new Map<Key, string>();
  let unfaded: Set<Key> | undefined;
  for (const drawing of drawings) {
    switch (drawing.kind) {
      case 'glow':
        glows.set(drawing.square, toneColors[drawing.tone]);
        break;
      case 'arrow':
        shapes.push({
          orig: drawing.from,
          dest: drawing.to,
          brush: drawing.dashed ? dashedBrush(drawing.tone) : drawing.tone,
          label: drawing.step === undefined ? undefined : { text: String(drawing.step) },
        });
        break;
      case 'line':
        if (drawing.squares.length < 2) break;
        shapes.push({
          orig: drawing.squares[0],
          customSvg: { html: lineMarkup(drawing.squares, orientation, toneColors[drawing.tone]) },
          below: true,
        });
        break;
      case 'ring':
        shapes.push({ orig: drawing.square, brush: drawing.tone });
        break;
      case 'tint':
        for (const square of drawing.squares) tints.set(square, `tint-${drawing.tone}`);
        break;
      case 'label':
        shapes.push({
          orig: drawing.square,
          customSvg: { html: labelMarkup(drawing.text, toneColors[drawing.tone]) },
        });
        break;
      case 'ghost':
        shapes.push({ orig: drawing.square, piece: { ...drawing.piece } });
        break;
      case 'badge':
        shapes.push({ orig: drawing.square, customSvg: { html: badgeCorner(drawing.quality) } });
        glows.set(drawing.square, qualityLooks[drawing.quality].color);
        break;
      case 'fade':
        unfaded ??= new Set();
        for (const square of drawing.except) unfaded.add(square);
        break;
    }
  }
  return { shapes, tints, glows, unfaded };
}

// Custom SVG is drawn in a 100 by 100 box on its first square.
const BOX = 100;

/**
 * A line from the center of the first square through the others', in that
 * square's box. Rounded, so a chain of pawns reads as one stroke.
 */
function lineMarkup(squares: readonly Square[], orientation: Color, color: string): string {
  const [first] = squares;
  const points = squares.map((square) => {
    const [dx, dy] = offset(first, square, orientation);
    return `${BOX / 2 + dx * BOX},${BOX / 2 + dy * BOX}`;
  });
  return (
    `<polyline points="${points.join(' ')}" fill="none" stroke="${color}" stroke-opacity="0.85" ` +
    `stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>`
  );
}

/**
 * How many squares right and down `to` is from `from`, as the board is seen.
 * (Chessground's key2pos does this, but chessground ships only ES modules,
 * which Jest can't load, and this file is tested.)
 */
function offset(from: Square, to: Square, orientation: Color): [number, number] {
  const right = to.charCodeAt(0) - from.charCodeAt(0);
  const down = from.charCodeAt(1) - to.charCodeAt(1);
  return orientation === 'white' ? [right, down] : [-right, -down];
}

/** A label's pill, along the bottom of its square, so the piece stays in view. */
const LABEL = { height: 30, bottom: 4, font: 22, charWidth: 13, padding: 10 } as const;

function labelMarkup(text: string, color: string): string {
  const width = Math.min(BOX - 8, text.length * LABEL.charWidth + 2 * LABEL.padding);
  const x = (BOX - width) / 2;
  const y = BOX - LABEL.bottom - LABEL.height;
  return (
    `<rect x="${x}" y="${y}" width="${width}" height="${LABEL.height}" rx="${LABEL.height / 2}" ` +
    `fill="${color}" stroke="${pieceColors.white}" stroke-width="2"/>` +
    `<text x="${BOX / 2}" y="${y + LABEL.height / 2}" text-anchor="middle" dominant-baseline="central" ` +
    `font-size="${LABEL.font}" fill="${pieceColors.white}">${escapeText(text)}</text>`
  );
}

function escapeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** The ink that rings a badge on the board, to set it off from the squares. */
const BADGE_RING = pieceColors.black;
/** A badge's size and center on its square, in hundredths of the square. */
const BADGE = { size: 34, x: 82, y: 18 } as const;

/** A label's badge, overlapping the top right corner of its square. */
function badgeCorner(quality: MoveQuality): string {
  const scale = BADGE.size / BADGE_BOX;
  const x = BADGE.x - BADGE.size / 2;
  const y = BADGE.y - BADGE.size / 2;
  return `<g transform="translate(${x} ${y}) scale(${scale})">${badgeMarkup(quality, BADGE_RING)}</g>`;
}
