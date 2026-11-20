import { describe, expect, it } from '@jest/globals';

import { replay } from '@/game/replay';

import { uciLine } from './lesson.fixture';
import {
  beforeSideMoves,
  initialMode,
  type ModeAction,
  modeReducer,
  type ModeState,
  type MoveKind,
  moveKinds,
  opponentPlays,
} from './practice';

/** The learner plays Black; `slips` are the indexes of their moves the guide doesn't recommend. */
const kindsOf = (line: readonly string[], slips: number[] = []): MoveKind[] =>
  line.map((_, n) => (n % 2 === 0 ? 'opponent' : slips.includes(n) ? 'slip' : 'book'));
const chosen = (mode: 'explore' | 'practice', line: readonly string[]) =>
  ({ type: 'modeChosen', mode, line, kinds: kindsOf(line) }) satisfies ModeAction;
/** The game's moves become `sans`, with the learner's moves at `slips` non-book. */
const moved =
  (sans: string[], slips: number[] = []) =>
  (state: ModeState): ModeState => {
    const line = uciLine(...sans);
    const from = state.mode === 'practice' ? state.line : [];
    return modeReducer(state, { type: 'moved', from, line, kinds: kindsOf(line, slips) });
  };
const clean = (state: ModeState) => state.mode === 'practice' && state.clean;
const run = (state: ModeState, ...steps: ((state: ModeState) => ModeState)[]) =>
  steps.reduce((at, step) => step(at), state);
/** Practice entered on `sans`: a clean run only before the learner's first move. */
const practiceOn = (sans: string[]) =>
  modeReducer(initialMode, chosen('practice', uciLine(...sans)));

describe('modeReducer', () => {
  it('starts in Explore, which keeps no run', () => {
    expect(initialMode).toEqual({ mode: 'explore' });
    expect(run(initialMode, moved(['e4', 'e6'], [1]))).toBe(initialMode);
  });

  it('starts a clean run only when Practice is entered before the first move', () => {
    expect(clean(run(practiceOn(['e4']), moved(['e4', 'c6'])))).toBe(true);
    // Exploring to the last move, then switching to Practice and finishing, is not a pass.
    expect(clean(run(practiceOn(['e4', 'c6', 'd4']), moved(['e4', 'c6', 'd4', 'd5'])))).toBe(false);
  });

  it("keeps the run through book moves and the opponent's moves", () => {
    const state = run(
      practiceOn(['e4']),
      moved(['e4', 'c6']),
      moved(['e4', 'c6', 'd4']),
      moved(['e4', 'c6', 'd4', 'd5']),
    );
    expect(clean(state)).toBe(true);
  });

  it('counts every move that lands at once', () => {
    expect(clean(run(practiceOn(['e4']), moved(['e4', 'c6', 'd4', 'd5'])))).toBe(true);
    expect(clean(run(practiceOn(['e4']), moved(['e4', 'c6', 'd4', 'e6'], [3])))).toBe(false);
  });

  it('spoils the run on a non-book move, or on any move taken back', () => {
    const slipped = run(
      practiceOn(['e4']),
      moved(['e4', 'c6']),
      moved(['e4', 'c6', 'd4', 'e6'], [3]),
    );
    expect(clean(slipped)).toBe(false);
    // A slip taken back and replaced with the book move still spoils it.
    expect(clean(run(slipped, moved(['e4', 'c6', 'd4', 'd5'])))).toBe(false);
    const played = run(practiceOn(['e4']), moved(['e4', 'c6', 'd4', 'd5']));
    // The opponent's move replaced (auto play off), or the same move played again.
    expect(clean(run(played, moved(['e4', 'c6', 'c4'])))).toBe(false);
    expect(clean(run(played, moved(['e4', 'c6', 'd4'])))).toBe(false);
    // The last move played again takes nothing back.
    expect(clean(run(played, moved(['e4', 'c6', 'd4', 'd5'])))).toBe(true);
  });

  it("starts again at the learner's first move", () => {
    const explored = practiceOn(['e4', 'c6', 'd4']);
    // Played again just as it was, or another first move.
    expect(clean(run(explored, moved(['e4', 'c6'])))).toBe(true);
    // Also as the last move of the line, which takes nothing back.
    expect(clean(run(practiceOn(['e4', 'c6']), moved(['e4', 'c6'])))).toBe(true);
    expect(clean(run(explored, moved(['e4', 'e6'], [1])))).toBe(false);
    // So does a move before it, and a new game.
    expect(clean(run(explored, moved(['d4'])))).toBe(true);
    expect(clean(run(explored, moved([])))).toBe(true);
  });

  it('ignores a change from moves other than the ones it counted', () => {
    const state = practiceOn(['e4', 'c6', 'd4']);
    const line = uciLine('e4', 'c6');
    expect(modeReducer(state, { type: 'moved', from: [...line], line, kinds: kindsOf(line) })).toBe(
      state,
    );
  });

  it('discards the run on leaving Practice, and keeps it when Practice is chosen again', () => {
    const state = run(practiceOn(['e4']), moved(['e4', 'c6']));
    expect(modeReducer(state, chosen('explore', []))).toBe(initialMode);
    expect(modeReducer(state, chosen('practice', []))).toBe(state);
  });
});

describe('moveKinds', () => {
  it("names each move by who played it, and the learner's by the guide", () => {
    const plies = replay(uciLine('e4', 'c6', 'd4', 'e6'));
    expect(moveKinds(plies, 'black', [false, true, false, false])).toEqual([
      'opponent',
      'book',
      'opponent',
      'slip',
    ]);
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
});

describe('opponentPlays', () => {
  const at = (ply: number) => ({ moves: uciLine('e4', 'c6', 'd4'), ply });

  it('leaves every opponent move to the learner with auto play off', () => {
    expect(opponentPlays('explore', false, at(3), false)).toBe(false);
    expect(opponentPlays('practice', false, at(3), false)).toBe(false);
  });

  it('leaves the moves that pick the opening to the learner', () => {
    expect(opponentPlays('practice', true, at(0), true)).toBe(false);
    expect(opponentPlays('explore', true, at(3), true)).toBe(false);
  });

  it('leaves one opponent move to the learner stepped back in Explore', () => {
    expect(opponentPlays('explore', true, at(2), false)).toBe(false);
    // At the latest move auto play answers, as it does once the picked move is played.
    expect(opponentPlays('explore', true, at(3), false)).toBe(true);
  });

  it('keeps Practice with auto play on to the opponent, stepped back or not', () => {
    expect(opponentPlays('practice', true, at(2), false)).toBe(true);
    expect(opponentPlays('practice', true, at(3), false)).toBe(true);
  });
});
