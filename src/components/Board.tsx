'use dom';

// Chessground draws the board with the DOM, so on Android this file runs in
// a web view (an Expo DOM component); on the web it renders inline.
// Props cross that boundary as JSON, and onMove becomes an async message.
import '@lichess-org/chessground/assets/chessground.base.css';
import '@lichess-org/chessground/assets/chessground.cburnett.css';
import './Board.css';

import { Chessground } from '@lichess-org/chessground';
import type { Api } from '@lichess-org/chessground/api';
import type { Config } from '@lichess-org/chessground/config';
import type { Key, PieceNode } from '@lichess-org/chessground/types';
import type { DOMProps } from 'expo/dom';
import { useEffect, useEffectEvent, useRef } from 'react';

import type { MoveQuality } from '@/analysis/quality';
import type { Color } from '@/game/replay';
import { BADGE_BOX, badgeMarkup, qualityLooks } from '@/theme/moveQuality';
import { pieceColors } from '@/theme/pieceColors';

export interface BoardProps {
  readonly fen: string;
  readonly orientation: Color;
  readonly turnColor: Color;
  /** Whose pieces can be moved; none while it's not the player's turn. */
  readonly movableColor?: Color;
  /** Legal destinations by origin square. */
  readonly dests: Record<string, string[]>;
  readonly lastMove?: readonly [string, string];
  /** The last move's label, shown on the piece it moved: a glow and a badge. */
  readonly lastMoveQuality?: MoveQuality;
  readonly check: boolean;
  readonly onMove: (from: string, to: string) => void;
  readonly dom?: DOMProps;
}

export default function Board({
  fen,
  orientation,
  turnColor,
  movableColor,
  dests,
  lastMove,
  lastMoveQuality,
  check,
  onMove,
}: BoardProps) {
  const element = useRef<HTMLDivElement>(null);
  const api = useRef<Api>(null);
  // Chessground keeps the callbacks it was created with.
  const handleMove = useEffectEvent((from: string, to: string) => onMove(from, to));

  const label =
    lastMove && lastMoveQuality ? { square: lastMove[1] as Key, quality: lastMoveQuality } : undefined;
  const config: Config = {
    fen,
    orientation,
    turnColor,
    check,
    lastMove: lastMove ? [...(lastMove as [Key, Key])] : undefined,
    movable: {
      free: false,
      color: movableColor,
      dests: new Map(Object.entries(dests)) as Map<Key, Key[]>,
    },
    drawable: {
      autoShapes: label ? [{ orig: label.square, customSvg: { html: cornerBadge(label.quality) } }] : [],
    },
  };

  useEffect(() => {
    if (!element.current) return;
    const board = Chessground(element.current, {
      ...config,
      premovable: { enabled: false },
      movable: {
        ...config.movable,
        events: { after: (from, to) => handleMove(from, to) },
      },
    });
    api.current = board;
    return () => {
      board.destroy();
      api.current = null;
    };
    // Created once; the effect below keeps it in step with the props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const board = api.current;
    if (!board) return;
    board.set(config);
    // Chessground draws the new position in set() or on a frame it asked for
    // first, so this frame comes after the draw.
    const frame = requestAnimationFrame(() => glow(board, label));
    return () => cancelAnimationFrame(frame);
  });

  return (
    // Square by its width, since the web view's page has no height to fill.
    <div style={{ width: '100%', aspectRatio: '1 / 1', touchAction: 'none' }}>
      <div ref={element} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}

/** The ink that rings a badge on the board, to set it off from the squares. */
const BADGE_RING = pieceColors.black;
/** A badge's size and center on its square, in hundredths of the square. */
const BADGE = { size: 34, x: 82, y: 18 } as const;

/** A label's badge, overlapping the top right corner of its square (drawn in a 100 by 100 box). */
function cornerBadge(quality: MoveQuality): string {
  const scale = BADGE.size / BADGE_BOX;
  const x = BADGE.x - BADGE.size / 2;
  const y = BADGE.y - BADGE.size / 2;
  return `<g transform="translate(${x} ${y}) scale(${scale})">${badgeMarkup(quality, BADGE_RING)}</g>`;
}

/**
 * Lights the labelled piece with a glow in its label's color, and puts out any
 * other. Chessground has no way to style one piece, so this marks its element
 * directly, after each draw (Board.css draws the glow).
 */
function glow(board: Api, label: { square: Key; quality: MoveQuality } | undefined) {
  for (const piece of board.state.dom.elements.board.querySelectorAll<PieceNode>('piece')) {
    const lit = label !== undefined && piece.cgKey === label.square && !piece.cgFading;
    piece.classList.toggle('glow', lit);
    if (lit) piece.style.setProperty('--glow', qualityLooks[label.quality].color);
  }
}
