'use dom';

// Chessground draws the board with the DOM, so on Android this file runs in
// a web view (an Expo DOM component); on the web it renders inline.
// Props cross that boundary as JSON, and function props become async messages.
import '@lichess-org/chessground/assets/chessground.base.css';
import '@lichess-org/chessground/assets/chessground.cburnett.css';
// Last: its rules match chessground's own selectors and win by coming after them.
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
import type { Ending, Mood } from '@/game/ending';
import {
  ACT_TIMES,
  type EndingAct,
  endingAct,
  KING_PARTS,
  type KingPart,
  MOVE_MS,
} from '@/board/endingAct';
import { type BoardMarks, boardMarks, toneBrushes } from '@/board/marks';
import { type BoardPointer, type Drag, watchBoardPointer, watchDrag } from '@/board/pointer';
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
  /**
   * How the game in `fen` ended for the learner, who plays `orientation`:
   * the board acts it out on the kings once (EndingCard.tsx names it over the board).
   */
  readonly ending?: Ending;
  readonly onMove: (from: string, to: string) => void;
  /**
   * Each square a piece being dragged is over (none over its own square or
   * off the board), and null once the drag ends without a move.
   */
  readonly onDrag?: (drag: Drag<Square> | null) => void;
  /**
   * A square was clicked or tapped, empty or not, including the press that
   * starts a drag and the one that ends a move, with the square picked
   * before it, if any. It comes just after the board has acted on the press.
   */
  readonly onPress?: (square: Square, selected?: Square) => void;
  /**
   * While the board shows an `ending`: a mouse came onto the board or left
   * it, or a finger or pen tapped it. A mouse already on the board as the
   * ending arrives reports nothing until it leaves.
   */
  readonly onEndingPointer?: (pointer: BoardPointer) => void;
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
  ending,
  onMove,
  onDrag,
  onPress,
  onEndingPointer,
}: BoardProps) {
  const element = useRef<HTMLDivElement>(null);
  const api = useRef<Api>(null);
  // Chessground and the pointer listeners keep the callbacks they were given.
  const handleMove = useEffectEvent((from: string, to: string) => onMove(from, to));
  const squareAt = (x: number, y: number) =>
    api.current?.getKeyAtDomPos([x, y]) as Square | undefined;
  const handleDrag = useEffectEvent((drag: Drag<Square> | null) => onDrag?.(drag));
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
  const endingKey = ending && JSON.stringify(ending);
  const act = useMemo(
    () => (endingKey ? endingAct(JSON.parse(endingKey) as Ending, orientation) : undefined),
    [endingKey, orientation],
  );
  // Read as each event comes, so the press that plays the mating move, before
  // the ending arrives, reports nothing.
  const handleEndingPointer = useEffectEvent((pointer: BoardPointer) => {
    if (act) onEndingPointer?.(pointer);
  });

  // Chessground reuses piece elements as pieces move, so the lit, faded and
  // previewed pieces, and an ending's kings, are marked again whenever the
  // pieces, the drawings, the preview or the ending change: after new props,
  // and after a move made on the board. Chessground draws on a frame it asked
  // for first, so this frame comes after the draw.
  const frame = useRef(0);
  const markAfterDraw = useEffectEvent(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      if (!api.current) return;
      const previewElement = drawPreview(api.current, layer, orientation);
      markPieces(api.current, marks, layer, previewElement);
      stageEnding(api.current, act);
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
    const square = squareAt(x, y);
    const board = api.current;
    if (!picked || !square || !board) return;
    if (boardPlays(board, picked, square) && playsPreview(layer, picked, square))
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
      // The ending's beats (ACT_TIMES) are timed from this slide.
      animation: { duration: MOVE_MS },
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
    const stopWatching = watchDrag<Square>(
      target.ownerDocument,
      () => {
        const drag = board.state.draggable.current;
        return drag?.started ? (drag.orig as Square) : undefined;
      },
      squareAt,
      (from, to) => boardPlays(board, from, to),
      handleDrag,
    );
    const stopWatchingEnding = watchBoardPointer(target, handleEndingPointer);
    return () => {
      cancelAnimationFrame(frame.current);
      target.removeEventListener('pointerdown', notePick, { capture: true });
      stopWatching();
      stopWatchingEnding();
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

  useEffect(() => markAfterDraw(), [position, marks, layer, act]);

  return (
    // Square by its width, since the web view's page has no height to fill.
    <div style={{ width: '100%', aspectRatio: '1 / 1', touchAction: 'none' }}>
      <style>{TINT_CSS}</style>
      <div ref={element} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}

/**
 * Whether `board` would play the piece on `from` dropped on `to`. Ask on
 * pointerdown or pointerup: chessground clears its legal moves once it plays
 * one, on the mouseup or touchend that follows.
 */
const boardPlays = (board: Api, from: Square, to: Square) =>
  !!board.state.movable.dests?.get(from)?.includes(to);

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

/** An ending's own layer, over the pieces: the dark house, and what a win throws. */
const ENDING_TAG = 'cg-ending';
// ACT_TIMES has every mood, so its keys are all of them.
const MOODS = Object.keys(ACT_TIMES) as Mood[];

/**
 * Plays `act` on the board once, and takes it off again when there is none
 * (Board.css draws it). The act starts when it is first staged: called again
 * with the same act, as after each redraw, it only marks the kings again,
 * so nothing restarts.
 */
function stageEnding(board: Api, act: EndingAct | undefined) {
  const { container, board: squares } = board.state.dom.elements;
  const staged = container.querySelector<HTMLElement>(ENDING_TAG);
  // Most redraws have no ending, and none on the board to take off.
  if (!act && !staged) return;
  const pieces = squares.querySelectorAll<PieceNode>('piece');
  if (staged?.dataset.act !== (act && actKey(act))) {
    if (staged) clearEnding(board, staged, pieces);
    if (act) startEnding(board, act);
  }
  if (act) markKings(pieces, act);
}

/** Takes the staged act off the board: its layer, the kings' parts, and its mood. */
function clearEnding(board: Api, staged: HTMLElement, pieces: Iterable<PieceNode>) {
  staged.remove();
  for (const piece of pieces) piece.classList.remove('ending-king', ...KING_PARTS.map(partClass));
  board.state.dom.elements.wrap.classList.remove(...MOODS.map((mood) => `ending-${mood}`));
}

/** Puts `act` on the board from its beginning; markKings then casts the kings. */
function startEnding(board: Api, act: EndingAct) {
  const { wrap, board: squares } = board.state.dom.elements;
  // Laid out without the last act's classes, so this one starts from its beginning.
  wrap.getBoundingClientRect();
  wrap.classList.add(`ending-${act.mood}`);
  for (const [beat, ms] of Object.entries(ACT_TIMES[act.mood]))
    wrap.style.setProperty(`--act-${beat}`, `${ms}ms`);
  const layer = endingLayer(act);
  layer.dataset.act = actKey(act);
  squares.after(layer);
}

/**
 * Which act is staged: the same act again, as after a redraw, has the same
 * key. The spot and the cut are in it because they move when the board turns
 * around, and the layer is drawn from them.
 */
const actKey = ({ mood, kings, spot, cut }: EndingAct) => JSON.stringify([mood, kings, spot, cut]);

/** Marks the kings' elements with their parts, which chessground may have swapped since. */
function markKings(pieces: Iterable<PieceNode>, act: EndingAct) {
  const kings = new Map(act.kings.map((king) => [king.square as Key, king]));
  for (const piece of pieces) {
    const king = piece.cgFading ? undefined : kings.get(piece.cgKey);
    piece.classList.toggle('ending-king', !!king);
    for (const part of KING_PARTS) piece.classList.toggle(partClass(part), king?.part === part);
  }
}

const partClass = (part: KingPart) => `ending-${part}`;

/**
 * The layer's elements for `act`, each carrying its numbers as CSS variables.
 * Each leaves once its animations are done, so the board doesn't carry them
 * while the position is studied; only the kings' classes stay. Each is
 * unseen until Board.css animates it, which it doesn't without motion, so
 * then the layer stays empty.
 */
function endingLayer({ spot, cut, sparks, confetti }: EndingAct): HTMLElement {
  const layer = document.createElement(ENDING_TAG);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return layer;
  layer.addEventListener('animationend', ({ target }) => {
    const element = target as HTMLElement;
    // A confetto tumbles in its ::before while it falls, and the veil fades in before it fades out.
    if (element.getAnimations({ subtree: true }).every(({ playState }) => playState === 'finished'))
      element.remove();
  });
  const add = (className: string, vars: Record<string, string | number> = {}) => {
    const element = document.createElement('i');
    element.className = className;
    for (const [name, value] of Object.entries(vars))
      element.style.setProperty(`--${name}`, String(value));
    layer.appendChild(element);
  };
  // The sword stroke through the beaten king's crown.
  if (cut) add('slash', { x: cut[0], y: cut[1] });
  // A draw lights no king, so its veil dims the board evenly.
  if (!spot) {
    add('veil');
    return layer;
  }
  const [x, y] = spot;
  // The light's center, as a place on the board.
  add('veil', { 'spot-x': `${(x + 0.5) * 12.5}%`, 'spot-y': `${(y + 0.5) * 12.5}%` });
  if (sparks.length) {
    // Two rings: Board.css sends the second out after the first, as its echo.
    add('ring', { x, y });
    add('ring', { x, y });
  }
  for (const { to, size, delay, duration, tint } of sparks)
    add(`spark ${tint}`, {
      x,
      y,
      dx: to[0],
      dy: to[1],
      size,
      delay: `${delay}ms`,
      duration: `${duration}ms`,
    });
  for (const { x: column, drift, size, spin, delay, duration, tint } of confetti)
    add(`confetto ${tint}`, {
      x: column,
      drift,
      size,
      spin,
      delay: `${delay}ms`,
      duration: `${duration}ms`,
    });
  return layer;
}
