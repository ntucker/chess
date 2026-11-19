import { describe, expect, it } from '@jest/globals';

import { lastPosition } from '@/game/replay';

import { lessonBoard, pressedCandidate } from './board';
import { guidance, type LessonSwitches } from './guidance';
import { ADVANCE, SAMPLE, sampleView, uciLine } from './lesson.fixture';
import { type Pointer, preview } from './view';

const SWITCHES: LessonSwitches = { auto: true, showIdeas: true, showTraps: false };

/** The lesson's board after `sans`, with the learner pointing at `pointer`. */
function board(sans: string[], pointer?: Pointer) {
  const view = sampleView(sans);
  const moves = uciLine(...sans);
  const shown = guidance({
    view,
    mode: 'explore',
    switches: SWITCHES,
    preview: pointer && preview(SAMPLE, view, pointer),
  });
  const input = {
    side: SAMPLE.side,
    key: view.key,
    guidance: shown,
    moves,
    ply: moves.length,
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

  it('shows a candidate the same way whether its row or its destination square is pointed at', () => {
    const row = board(ADVANCE, { at: 'row', uci: 'c8f5' }).board;
    expect(board(ADVANCE, { at: 'square', square: 'f5' }).board).toEqual(row);
    // The move shown played, with the bishop's ghost on c8; it can't be moved on.
    expect(row.fen).toBe(lastPosition(uciLine(...ADVANCE, 'Bf5')).fen);
    expect(row.lastMove).toEqual(['c8', 'f5']);
    expect(row.movableColor).toBeUndefined();
    expect(row.drawings).toContainEqual({
      kind: 'ghost',
      square: 'c8',
      piece: { role: 'bishop', color: 'black' },
    });
  });

  it('keeps the piece pointed at in place, so it can still be dragged, and draws its candidate', () => {
    const pointed = board(ADVANCE, { at: 'square', square: 'c8' }).board;
    expect(pointed.fen).toBe(board(ADVANCE).board.fen);
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

describe('pressedCandidate', () => {
  it("plays a sliding preview's move when its square is pressed, and nothing elsewhere", () => {
    const { shown } = board(ADVANCE, { at: 'square', square: 'f5' });
    expect(pressedCandidate(shown, 'f5')?.san).toBe('Bf5');
    expect(pressedCandidate(shown, 'c8')).toBeUndefined();
    const pointedPiece = board(ADVANCE, { at: 'square', square: 'c8' }).shown;
    expect(pressedCandidate(pointedPiece, 'f5')).toBeUndefined();
  });
});
