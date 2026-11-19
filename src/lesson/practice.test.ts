import { describe, expect, it } from '@jest/globals';

import { replay } from '@/game/replay';

import { uciLine } from './lesson.fixture';
import {
  beforeSideMoves,
  initialMode,
  type ModeAction,
  modeReducer,
  type ModeState,
  opponentPlays,
  type PlayedMove,
} from './practice';

const practice = (clean: boolean): ModeState => ({ mode: 'practice', clean });
const chosen = (mode: 'explore' | 'practice', untouched: boolean): ModeAction => ({
  type: 'modeChosen',
  mode,
  untouched,
});
const BOOK: PlayedMove = { learner: true, book: true, first: false, replaces: false };
const played = (move: Partial<PlayedMove> = {}): ModeAction => ({
  type: 'played',
  ...BOOK,
  ...move,
});
const run = (state: ModeState, ...actions: ModeAction[]) => actions.reduce(modeReducer, state);

describe('modeReducer', () => {
  it('starts in Explore, which keeps no run', () => {
    expect(initialMode).toEqual({ mode: 'explore' });
    expect(run(initialMode, played({ book: false }))).toEqual(initialMode);
  });

  it('starts a clean run only when Practice is entered before the first move', () => {
    expect(run(initialMode, chosen('practice', true))).toEqual(practice(true));
    // Exploring to the last move, then switching to Practice and finishing, is not a pass.
    expect(run(initialMode, chosen('practice', false), played())).toEqual(practice(false));
  });

  it('keeps the run through book moves and the opponent moves the learner picks', () => {
    expect(run(practice(true), played(), played({ learner: false, book: false }))).toEqual(
      practice(true),
    );
  });

  it('spoils the run on a non-book move, or a move played from an earlier position', () => {
    expect(run(practice(true), played({ book: false }))).toEqual(practice(false));
    // A slip taken back and replaced with the book move still spoils it.
    expect(run(practice(true), played({ book: false }), played({ replaces: true }))).toEqual(
      practice(false),
    );
    expect(run(practice(true), played({ learner: false, replaces: true }))).toEqual(
      practice(false),
    );
  });

  it("starts again at the learner's first move", () => {
    expect(run(practice(false), played({ first: true, replaces: true }))).toEqual(practice(true));
    expect(run(practice(false), played({ first: true, book: false }))).toEqual(practice(false));
  });

  it('discards the run on leaving Practice, and keeps it when Practice is chosen again', () => {
    expect(run(practice(true), chosen('explore', false))).toEqual(initialMode);
    expect(run(practice(true), chosen('practice', false))).toEqual(practice(true));
  });
});

describe('beforeSideMoves', () => {
  const plies = replay(uciLine('e4', 'c6', 'd4', 'd5'));

  it("counts the side's moves among the first moves of the line", () => {
    expect(beforeSideMoves(plies, 'black', 1)).toBe(true);
    expect(beforeSideMoves(plies, 'black', 2)).toBe(false);
    expect(beforeSideMoves(plies, 'white', 0)).toBe(true);
    expect(beforeSideMoves(plies, 'white', 1)).toBe(false);
  });

  it('keeps a line explored to its end from passing by stepping back, choosing Practice and stepping on', () => {
    // Back at the start the board is before Black's first move, but the line isn't untouched.
    expect(beforeSideMoves(plies, 'black', 0)).toBe(true);
    const afterStepBack = run(initialMode, chosen('practice', false));
    expect(afterStepBack).toEqual(practice(false));
    // Playing the first move again, from the start, begins a clean run.
    expect(run(afterStepBack, played({ first: true, replaces: true }))).toEqual(practice(true));
  });

  it('starts a clean run when Practice is chosen on a line with no move of the learner yet', () => {
    expect(run(initialMode, chosen('practice', true))).toEqual(practice(true));
  });
});

describe('opponentPlays', () => {
  const at = (ply: number) => ({ moves: uciLine('e4', 'c6', 'd4'), ply });

  it('leaves every opponent move to the learner with auto play off', () => {
    expect(opponentPlays('explore', false, at(3))).toBe(false);
    expect(opponentPlays('practice', false, at(3))).toBe(false);
  });

  it('leaves the first move, which picks the opening, to the learner', () => {
    expect(opponentPlays('practice', true, at(0))).toBe(false);
  });

  it('leaves one opponent move to the learner stepped back in Explore', () => {
    expect(opponentPlays('explore', true, at(2))).toBe(false);
    // At the latest move auto play answers, as it does once the picked move is played.
    expect(opponentPlays('explore', true, at(3))).toBe(true);
  });

  it('keeps Practice with auto play on to the opponent, stepped back or not', () => {
    expect(opponentPlays('practice', true, at(2))).toBe(true);
    expect(opponentPlays('practice', true, at(3))).toBe(true);
  });
});
