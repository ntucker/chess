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
import { useEffect, useEffectEvent, useMemo, useRef } from 'react';
import { flushSync } from 'react-dom';

import { type Drawing, type Square, TONES } from '@/board/drawing';
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
   * starts a drag and the one that ends a move, with the square picked
   * before it, if any. While a move is previewed the board shows it played,
   * so chessground can't play it; a click on its square comes here instead.
   */
  readonly onPress?: (square: Square, selected?: Square) => void;
  readonly dom?: DOMProps;
}

export default function Board({
  fen,
  orientation,
  turnColor,
  movableColor,
  dests,
  lastMove,
  check,
  drawings = [],
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
  const handlePress = useEffectEvent((square: Square, selected?: Square) =>
    onPress?.(square, selected),
  );

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

  // Chessground reuses piece elements as pieces move, so the lit and faded
  // pieces are marked again whenever the pieces or the drawings change: after
  // new props, and after a move made on the board. Chessground draws on a
  // frame it asked for first, so this frame comes after the draw.
  const frame = useRef(0);
  const markAfterDraw = useEffectEvent(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      if (api.current) markPieces(api.current, marks);
    });
  });

  // A screen left underneath stays mounted but hidden, where the board has no
  // size and chessground would draw its arrows at NaN. Changes made while it
  // is hidden wait, and go to chessground once the board shows again.
  const behind = useRef(false);
  const shows = () => !!element.current?.getClientRects().length;
  const setBoard = useEffectEvent((config: Config) => {
    if (shows()) api.current?.set(config);
    else behind.current = true;
  });
  const catchUp = useEffectEvent(() => {
    if (!behind.current || !shows()) return;
    behind.current = false;
    api.current?.set(position);
    api.current?.set(marksConfig(marks));
    markAfterDraw();
  });

  useEffect(() => {
    const target = element.current;
    if (!target) return;
    // The square picked before a press. Chessground reports the press after it
    // has acted on it, when a refused move has already dropped the pick, so
    // it is read as the press starts: a capture listener on the board's own
    // element runs before chessground's handlers on the elements inside it.
    let picked: Square | undefined;
    const notePick = () => {
      picked = api.current?.state.selected as Square | undefined;
    };
    target.addEventListener('pointerdown', notePick, { capture: true });
    const board = Chessground(target, {
      ...position,
      premovable: { enabled: false },
      events: {
        select: (square) => handlePress(square as Square, picked),
        change: () => markAfterDraw(),
      },
      movable: { ...position.movable, events: { after: (from, to) => handleMove(from, to) } },
      // Added to chessground's own brushes, which it keeps.
      drawable: { brushes: toneBrushes as DrawBrushes },
    });
    api.current = board;
    // Made after chessground's own observer, so chessground has measured the
    // board again by the time this catches up.
    const showing = new ResizeObserver(() => catchUp());
    showing.observe(target);
    // A preview a hover starts or ends reaches chessground before the next
    // press: a quick click right after a hover would otherwise land on the
    // board as it was, and chessground would refuse or misplay it. This holds
    // on the web, where the board renders inline in the screen's React tree;
    // on Android its props come back by message. React can't flush from this
    // effect's cleanup, where stopping reports a held finger's release.
    let live = true;
    const flush = (report: () => void) => (live ? flushSync(report) : report());
    const stopWatching = watchPointer<Square>(
      target,
      target.ownerDocument,
      (x, y) => board.getKeyAtDomPos([x, y]) as Square | undefined,
      {
        hover: (square) => flush(() => handleHover(square)),
        hold: (square) => flush(() => handleHold(square)),
      },
    );
    return () => {
      cancelAnimationFrame(frame.current);
      target.removeEventListener('pointerdown', notePick, { capture: true });
      live = false;
      stopWatching();
      showing.disconnect();
      board.destroy();
      api.current = null;
    };
    // Created once; the effects below keep it in step with the props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => setBoard(position), [position]);

  useEffect(() => setBoard(marksConfig(marks)), [marks]);

  useEffect(() => markAfterDraw(), [position, marks]);

  return (
    // Square by its width, since the web view's page has no height to fill.
    <div style={{ width: '100%', aspectRatio: '1 / 1', touchAction: 'none' }}>
      <style>{TINT_CSS}</style>
      <div ref={element} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}

/** The arrows, circles and tints that draw `marks`. */
const marksConfig = (marks: BoardMarks): Config => ({
  drawable: { autoShapes: marks.shapes },
  highlight: { custom: marks.tints },
});

/**
 * A tinted square in each tone (marks.ts names the classes), under its piece.
 * Written from TONES and toneColors, so a new tone or color needs no CSS edit.
 */
const TINT_CSS = TONES.map(
  (tone) =>
    `cg-board square.tint-${tone} { background-color: color-mix(in srgb, ${toneColors[tone]} 40%, transparent); }`,
).join('\n');

/**
 * Lights and fades pieces. Chessground has no way to style one piece, so this
 * marks their elements directly (Board.css draws the glow and the fade).
 */
function markPieces(board: Api, { glows, unfaded }: BoardMarks) {
  for (const piece of board.state.dom.elements.board.querySelectorAll<PieceNode>('piece')) {
    // A captured piece on its way out keeps neither.
    const glow = piece.cgFading ? undefined : glows.get(piece.cgKey);
    const faded = !piece.cgFading && unfaded !== undefined && !unfaded.has(piece.cgKey);
    piece.classList.toggle('glow', glow !== undefined);
    if (glow) piece.style.setProperty('--glow', glow);
    piece.classList.toggle('faded', faded);
  }
}
