'use dom';

// Chessground draws the board with the DOM, so on Android this file runs in
// a web view (an Expo DOM component); on the web it renders inline.
// Props cross that boundary as JSON, and function props become async messages.
import '@lichess-org/chessground/assets/chessground.base.css';
import '@lichess-org/chessground/assets/chessground.cburnett.css';
import './Board.css';

import { Chessground } from '@lichess-org/chessground';
import type { Api } from '@lichess-org/chessground/api';
import type { Config } from '@lichess-org/chessground/config';
import type { DrawBrushes } from '@lichess-org/chessground/draw';
import type { Key, PieceNode } from '@lichess-org/chessground/types';
import type { DOMProps } from 'expo/dom';
import { type CSSProperties, useEffect, useEffectEvent, useMemo, useRef } from 'react';

import type { Drawing, Square } from '@/board/drawing';
import { type BoardMarks, boardMarks, toneBrushes } from '@/board/marks';
import { watchPointer } from '@/board/pointer';
import type { Color } from '@/game/replay';
import { toneColors } from '@/theme/drawingTones';

export interface BoardProps {
  readonly fen: string;
  readonly orientation: Color;
  readonly turnColor: Color;
  /** Whose pieces can be moved; none while it's not the player's turn. */
  readonly movableColor?: Color;
  /** Legal destinations by origin square. */
  readonly dests: Record<string, string[]>;
  readonly lastMove?: readonly [string, string];
  readonly check: boolean;
  /**
   * What to draw over the position. Changing only these never resets the
   * position, so it can change while a piece is being dragged. A new `fen`
   * slides the pieces that moved, which is how a previewed move animates.
   */
  readonly drawings?: readonly Drawing[];
  readonly onMove: (from: string, to: string) => void;
  /**
   * The square under the mouse, or null once it leaves the board. It doesn't
   * change while a mouse button is down, so a drag never starts a preview.
   */
  readonly onHover?: (square: Square | null) => void;
  /** The square a finger presses and holds, or null once it lifts. */
  readonly onHold?: (square: Square | null) => void;
  /**
   * A square was clicked or tapped, empty or not, including the press that
   * starts a drag and the one that ends a move. While a move is previewed its
   * piece has left its square, so this is how a click there can play it.
   */
  readonly onPress?: (square: Square) => void;
  readonly dom?: DOMProps;
}

const NO_DRAWINGS: readonly Drawing[] = [];

export default function Board({
  fen,
  orientation,
  turnColor,
  movableColor,
  dests,
  lastMove,
  check,
  drawings = NO_DRAWINGS,
  onMove,
  onHover,
  onHold,
  onPress,
}: BoardProps) {
  const element = useRef<HTMLDivElement>(null);
  const api = useRef<Api>(null);
  // Chessground and the pointer listeners keep the callbacks they were given.
  const handleMove = useEffectEvent((from: string, to: string) => onMove(from, to));
  const handleHover = useEffectEvent((square: Square | null) => onHover?.(square));
  const handleHold = useEffectEvent((square: Square | null) => onHold?.(square));
  const handlePress = useEffectEvent((square: Square) => onPress?.(square));

  // Props arrive as fresh objects on every render (and as JSON on Android),
  // so the board is updated by what they say, not by their identity.
  const destsKey = JSON.stringify(dests);
  const [lastFrom, lastTo] = lastMove ?? [];
  const position = useMemo(
    (): Config => ({
      fen,
      orientation,
      turnColor,
      check,
      lastMove: lastFrom && lastTo ? [lastFrom as Key, lastTo as Key] : undefined,
      movable: {
        free: false,
        color: movableColor,
        dests: new Map(Object.entries(JSON.parse(destsKey))) as Map<Key, Key[]>,
      },
    }),
    [fen, orientation, turnColor, check, lastFrom, lastTo, movableColor, destsKey],
  );
  const drawingsKey = JSON.stringify(drawings);
  const marks = useMemo(
    () => boardMarks(JSON.parse(drawingsKey) as Drawing[], orientation),
    [drawingsKey, orientation],
  );

  useEffect(() => {
    const target = element.current;
    if (!target) return;
    const board = Chessground(target, {
      ...position,
      premovable: { enabled: false },
      events: { select: (square) => handlePress(square as Square) },
      movable: { ...position.movable, events: { after: (from, to) => handleMove(from, to) } },
      // Added to chessground's own brushes, which it keeps.
      drawable: { brushes: toneBrushes as DrawBrushes },
    });
    api.current = board;
    const stopWatching = watchPointer<Square>(
      target,
      target.ownerDocument,
      (x, y) => board.getKeyAtDomPos([x, y]) as Square | undefined,
      { hover: (square) => handleHover(square), hold: (square) => handleHold(square) },
    );
    return () => {
      stopWatching();
      board.destroy();
      api.current = null;
    };
    // Created once; the effects below keep it in step with the props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    api.current?.set(position);
  }, [position]);

  useEffect(() => {
    api.current?.set({ drawable: { autoShapes: marks.shapes }, highlight: { custom: marks.tints } });
  }, [marks]);

  // Chessground reuses piece elements as pieces move, so the lit and faded
  // pieces are marked again after every draw. Chessground draws a new
  // position in set() or on a frame it asked for first, so this frame comes
  // after the draw.
  useEffect(() => {
    const board = api.current;
    if (!board) return;
    const frame = requestAnimationFrame(() => markPieces(board, marks));
    return () => cancelAnimationFrame(frame);
  });

  return (
    // Square by its width, since the web view's page has no height to fill.
    <div style={{ width: '100%', aspectRatio: '1 / 1', touchAction: 'none', ...TONE_VARIABLES }}>
      <div ref={element} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}

/** Each tone's color as a CSS variable, for the tints in Board.css. */
const TONE_VARIABLES = Object.fromEntries(
  Object.entries(toneColors).map(([tone, color]) => [`--tone-${tone}`, color]),
) as CSSProperties;

/**
 * Lights and fades pieces. Chessground has no way to style one piece, so this
 * marks their elements directly (Board.css draws the glow and the fade).
 */
function markPieces(board: Api, { glows, unfaded }: BoardMarks) {
  for (const piece of board.state.dom.elements.board.querySelectorAll<PieceNode>('piece')) {
    const glow = piece.cgFading ? undefined : glows.get(piece.cgKey);
    piece.classList.toggle('glow', glow !== undefined);
    if (glow) piece.style.setProperty('--glow', glow);
    piece.classList.toggle('faded', unfaded !== undefined && !piece.cgFading && !unfaded.has(piece.cgKey));
  }
}
