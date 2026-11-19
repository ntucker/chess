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
import { read } from '@lichess-org/chessground/fen';
import type { Key, PieceNode } from '@lichess-org/chessground/types';
import type { DOMProps } from 'expo/dom';
import { useEffect, useEffectEvent, useMemo, useRef } from 'react';

import { type Drawing, type Square, squareOffset, TONES } from '@/board/drawing';
import { type BoardMarks, boardMarks, toneBrushes } from '@/board/marks';
import { watchPointer } from '@/board/pointer';
import {
  NO_PREVIEW,
  type Pieces,
  type PreviewLayer,
  type PreviewPiece,
  playsPreview,
  previewLayer,
  samePlacement,
} from '@/board/preview';
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
   * A position to show over `fen` without playing it, like a move pointed at
   * before it's played: the pieces that differ slide to where it has them,
   * leaving a ghost where they stood (src/board/preview.ts). The board under
   * it stays `fen`'s, so presses and drags still play on the game. Only its
   * piece placement is read, so a FEN without move counters will do.
   */
  readonly preview?: string;
  /**
   * What to draw over the position, or over `preview` while there is one.
   * Changing only these never resets the position, so it can change while a
   * piece is being dragged.
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
   * before it, if any. It comes just after the board has acted on the press.
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
  preview,
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
  const layer = useMemo(
    () => (preview ? previewLayer(read(fen) as Pieces, read(preview) as Pieces) : NO_PREVIEW),
    [fen, preview],
  );

  // Chessground reuses piece elements as pieces move, so the lit, faded and
  // previewed pieces are marked again whenever the pieces, the drawings or
  // the preview change: after new props, and after a move made on the board.
  // Chessground draws on a frame it asked for first, so this frame comes
  // after the draw.
  const frame = useRef(0);
  const markAfterDraw = useEffectEvent(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      if (!api.current) return;
      const previewElement = drawPreview(api.current, layer, orientation);
      markPieces(api.current, marks, layer, previewElement);
    });
  });

  // A screen left underneath stays mounted but hidden, where the board has no
  // size and chessground would draw its arrows at NaN. Changes made while it
  // is hidden wait, and go to chessground once the board has a size again.
  // `sized` follows chessground's measurements rather than the layout now,
  // since chessground draws with the size it measured until it measures again:
  // it is read when chessground is made, and then after each of its resizes.
  // A redraw chessground queued while the board still had a size runs after it
  // is hidden, so hiding also takes the drawn shapes away until it comes back.
  const sized = useRef(false);
  const pending = useRef(false);
  const setBoard = useEffectEvent((config: Config) => {
    if (sized.current) api.current?.set(config);
    else pending.current = true;
  });
  const catchUp = useEffectEvent(() => {
    if (!pending.current || !sized.current) return;
    pending.current = false;
    api.current?.set(position);
    api.current?.set(marksConfig(marks));
    markAfterDraw();
  });

  // A press that plays the previewed move with the picked piece: chessground
  // plays it itself, and would slide the piece to where the preview already
  // draws it, so its slide is turned off. The position effect below turns the
  // animation back on as the game reaches the preview.
  const skipPreviewSlide = useEffectEvent((picked: Square | undefined, x: number, y: number) => {
    const square = api.current?.getKeyAtDomPos([x, y]) as Square | undefined;
    const boardPlays =
      picked && square && api.current?.state.movable.dests?.get(picked)?.includes(square);
    if (boardPlays && playsPreview(layer, picked, square))
      setBoard({ animation: { enabled: false } });
  });

  useEffect(() => {
    const target = element.current;
    if (!target) return;
    // The square picked before a press. Chessground reports the press a
    // moment after it has acted on it, when a move has already dropped the
    // pick, so it is read as the press starts: a capture listener on the
    // board's own element runs before chessground's handlers inside it.
    let picked: Square | undefined;
    const notePick = (press: PointerEvent) => {
      picked = api.current?.state.selected as Square | undefined;
      // Chessground plays a move only for one finger or the left button alone,
      // without shift, which draws an arrow instead.
      if (press.isPrimary && press.buttons === 1 && !press.shiftKey)
        skipPreviewSlide(picked, press.clientX, press.clientY);
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
    const { width, height } = target.getBoundingClientRect();
    sized.current = width > 0 && height > 0;
    // Made after chessground's own observer, which ResizeObserver notifies
    // first, so chessground has measured the board by the time this runs.
    const resizes = new ResizeObserver(([entry]) => {
      sized.current = entry.contentRect.width > 0 && entry.contentRect.height > 0;
      if (!sized.current) {
        board.set({ drawable: { autoShapes: [] } });
        pending.current = true;
      }
      catchUp();
    });
    resizes.observe(target);
    const stopWatching = watchPointer<Square>(
      target,
      target.ownerDocument,
      (x, y) => board.getKeyAtDomPos([x, y]) as Square | undefined,
      { hover: handleHover, hold: handleHold },
    );
    return () => {
      cancelAnimationFrame(frame.current);
      target.removeEventListener('pointerdown', notePick, { capture: true });
      stopWatching();
      resizes.disconnect();
      board.destroy();
      api.current = null;
    };
    // Created once; the effects below keep it in step with the props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The preview last shown. When the game reaches it, as the learner plays
  // the previewed move, its pieces are already drawn where they land, so the
  // board takes the new position at once instead of sliding them again.
  const shownPreview = useRef<string | undefined>(undefined);
  useEffect(() => {
    const reached = shownPreview.current !== undefined && samePlacement(shownPreview.current, fen);
    setBoard({ ...position, animation: { enabled: !reached } });
    // Chessground keeps the setting, and a move made on the board next should slide.
    if (reached) setBoard({ animation: { enabled: true } });
  }, [position, fen]);
  // Declared after the effect above, which runs first, so it still reads the
  // preview of the render before.
  useEffect(() => {
    shownPreview.current = preview;
  }, [preview]);

  useEffect(() => setBoard(marksConfig(marks)), [marks]);

  useEffect(() => markAfterDraw(), [position, marks, layer]);

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

/** The preview's own layer, over chessground's pieces and under its arrows. */
const PREVIEW_TAG = 'cg-preview';

/**
 * Draws the preview's pieces in their own layer, each placed by its square
 * so it follows the board's size without measuring it, and returns the
 * layer. A piece already drawn stays, so redrawing the same preview never
 * restarts its slide.
 */
function drawPreview(board: Api, { pieces }: PreviewLayer, orientation: Color): HTMLElement {
  const { container, board: squares } = board.state.dom.elements;
  let layer = container.querySelector<HTMLElement>(PREVIEW_TAG);
  if (!layer) {
    layer = document.createElement(PREVIEW_TAG);
    squares.after(layer);
  }
  const place = (piece: HTMLElement, square: Square) => {
    const [x, y] = squareOffset(square, orientation);
    piece.style.transform = `translate(${x * 100}%, ${y * 100}%)`;
  };
  const wanted = new Map<string, PreviewPiece>(
    pieces.map((shown) => [`${shown.from}${shown.square}${shown.piece.role}${orientation}`, shown]),
  );
  for (const piece of [...layer.children] as HTMLElement[]) {
    if (!wanted.delete(piece.dataset.key!)) piece.remove();
  }
  const added: { piece: HTMLElement; square: Square }[] = [];
  for (const [key, { from, square, piece: drawn }] of wanted) {
    const piece = document.createElement('piece');
    piece.className = `${drawn.color} ${drawn.role}`;
    piece.dataset.key = key;
    piece.dataset.square = square;
    place(piece, from);
    layer.appendChild(piece);
    added.push({ piece, square });
  }
  if (!added.length) return layer;
  // Laid out where they start, once, so the moves to their squares slide (Board.css).
  layer.getBoundingClientRect();
  for (const { piece, square } of added) place(piece, square);
  return layer;
}

/**
 * Lights and fades pieces, and ghosts or hides the game's pieces a preview
 * moves or takes. Chessground has no way to style one piece, so this marks
 * their elements directly (Board.css draws each look). The drawings are about
 * the position shown, so they mark the preview's pieces where it has them.
 */
function markPieces(
  board: Api,
  { glows, unfaded }: BoardMarks,
  { away, taken }: PreviewLayer,
  preview: HTMLElement,
) {
  // Marks `piece` by the drawings at `square`; without one it gets no look.
  const mark = (piece: HTMLElement, square?: Key) => {
    const glow = square && glows.get(square);
    piece.classList.toggle('glow', !!glow);
    if (glow) piece.style.setProperty('--glow', glow);
    piece.classList.toggle('faded', !!square && unfaded !== undefined && !unfaded.has(square));
  };
  for (const piece of board.state.dom.elements.board.querySelectorAll<PieceNode>('piece')) {
    const square = piece.cgKey as Square;
    piece.classList.toggle('away', away.has(square));
    piece.classList.toggle('taken', taken.has(square));
    // A piece the preview moves or takes, or a captured one on its way out, isn't lit or faded.
    const shown = !piece.cgFading && !away.has(square) && !taken.has(square);
    mark(piece, shown ? piece.cgKey : undefined);
  }
  for (const piece of preview.querySelectorAll<HTMLElement>('piece')) {
    mark(piece, piece.dataset.square as Key);
  }
}
