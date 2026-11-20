import { describe, expect, it } from '@jest/globals';

import type { Square } from '@/board/drawing';
import { lastPosition } from '@/game/replay';

import { boardPress, boardSelect, lessonBoard } from './board';
import { guidance, type LessonSwitches } from './guidance';
import { ADVANCE, SAMPLE, sampleView, uciLine } from './lesson.fixture';
import { type Pointer, preview } from './view';

const SWITCHES: LessonSwitches = { auto: true, showMoves: true, showTraps: false };

/** The lesson's board after `sans`, with the learner pointing at `pointer`. */
function board(sans: string[], pointer?: Pointer) {
  const view = sampleView(sans);
  const moves = uciLine(...sans);
  const shown = guidance({
    view,
    mode: 'explore',
    switches: SWITCHES,
    preview: pointer && preview(SAMPLE, view, pointer),
    lifted: pointer?.at === 'drag' ? pointer.from : undefined,
  });
  const input = {
    side: SAMPLE.side,
    key: view.key,
    guidance: shown,
    current: lastPosition(moves),
    canMove: true,
  };
  return { shown, input, board: lessonBoard(input) };
}

describe('lessonBoard', () => {
  it('shows the game, movable, with the candidates drawn', () => {
    const { board: shown } = board(ADVANCE);
    expect(shown).toMatchObject({
      fen: lastPosition(uciLine(...ADVANCE)).fen,
      orientation: 'black',
      movableColor: 'black',
      lastMove: ['e4', 'e5'],
    });
    expect(shown.drawings?.filter(({ kind }) => kind === 'arrow')).toHaveLength(2);
  });

  it("draws a row's move played over the game, which stays as it is and movable", () => {
    const row = board(ADVANCE, { at: 'row', uci: 'c8f5' }).board;
    expect(row.preview).toBe(sampleView([...ADVANCE, 'Bf5']).key);
    const game = board(ADVANCE).board;
    expect(row).toMatchObject({ fen: game.fen, movableColor: 'black', dests: game.dests });
    expect(row.drawings).toContainEqual({ kind: 'glow', square: 'f5', tone: 'main' });
  });

  it("leaves a dragged piece's move unplayed, and draws its candidates", () => {
    const pointed = board(ADVANCE, { at: 'drag', from: 'c8', to: 'f5' }).board;
    expect(pointed.fen).toBe(board(ADVANCE).board.fen);
    expect(pointed.preview).toBeUndefined();
    expect(pointed.movableColor).toBe('black');
    expect(pointed.drawings).toContainEqual({ kind: 'arrow', from: 'c8', to: 'f5', tone: 'main' });
    expect(pointed.drawings).not.toContainEqual(expect.objectContaining({ to: 'c5' }));
  });

  it('shows a playback board in place of the game, with nothing drawn and nothing to move', () => {
    const { input } = board(ADVANCE, { at: 'row', uci: 'c8f5' });
    const frame = { fen: '8/8/8/8/8/8/8/k6K w - - 0 1', turn: 'white' as const, check: false };
    expect(lessonBoard({ ...input, frame })).toMatchObject({
      fen: frame.fen,
      movableColor: undefined,
      dests: {},
      preview: undefined,
      drawings: [],
    });
  });

  it("badges the last move's label, but not on a preview", () => {
    const { input } = board(ADVANCE);
    expect(lessonBoard({ ...input, quality: 'best' }).drawings).toContainEqual({
      kind: 'badge',
      square: 'e5',
      quality: 'best',
    });
    const previewing = board(ADVANCE, { at: 'row', uci: 'c8f5' }).input;
    expect(
      lessonBoard({ ...previewing, quality: 'best' }).drawings?.some(
        ({ kind }) => kind === 'badge',
      ),
    ).toBe(false);
  });
});

describe('boardPress', () => {
  const press = (pointer: Pointer, square: Square, selected?: Square, canMove = true) => {
    const { shown, input } = board(ADVANCE, pointer);
    return boardPress(shown, input.current, canMove, square, selected);
  };
  const BF5 = { at: 'row', uci: 'c8f5' } as const;

  it("plays a sliding preview's move when its square is pressed", () => {
    expect(press(BF5, 'f5')).toMatchObject({ san: 'Bf5' });
  });

  it("ends the preview when the board plays the press as the picked piece's move", () => {
    // The board plays Bf5 itself with the bishop picked, and Nf6 with the knight.
    expect(press(BF5, 'f5', 'c8')).toBe('end');
    expect(press(BF5, 'f6', 'g8')).toBe('end');
    // A picked piece that can't move there leaves the press to the preview.
    expect(press(BF5, 'f5', 'e7')).toMatchObject({ san: 'Bf5' });
  });

  it('ends the preview on a press anywhere else, or while the learner may not move', () => {
    expect(press(BF5, 'c8')).toBe('end');
    expect(press(BF5, 'f5', undefined, false)).toBe('end');
  });

  it('leaves presses to the board when no preview slides', () => {
    expect(press({ at: 'drag', from: 'c8', to: 'f5' }, 'f5')).toBeUndefined();
  });
});

describe('boardSelect', () => {
  const select = (square: Square, selected?: Square, canMove = true) =>
    boardSelect(board(ADVANCE).input.current, canMove, square, selected);

  it("selects the side to move's piece, as the board does", () => {
    expect(select('c8')).toBe('c8');
    expect(select('g8', 'c8')).toBe('g8');
  });

  it('lets the piece go on a press that plays it, on it again, or anywhere else', () => {
    // The board plays Bf5 itself.
    expect(select('f5', 'c8')).toBeUndefined();
    expect(select('c8', 'c8')).toBeUndefined();
    // An empty square, and a piece of the side not to move.
    expect(select('a5', 'c8')).toBeUndefined();
    expect(select('e5')).toBeUndefined();
  });

  it('selects nothing while the learner may not move', () => {
    expect(select('c8', undefined, false)).toBeUndefined();
  });
});
