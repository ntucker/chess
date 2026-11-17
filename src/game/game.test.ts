import { describe, expect, it } from '@jest/globals';

import { awaitsMaia, type GameAction, gameReducer, type GameState, initialGame } from './game';
import { analyze, replay } from './replay';

const play = (...actions: GameAction[]) => actions.reduce(gameReducer, initialGame);
const position = (line: string[]) => analyze(replay(line).at(-1)!);

describe('gameReducer', () => {
  it('drops the opening move asked for Black after switching to White', () => {
    // Black asks Maia to open (game 1); White starts game 2 before she answers.
    const state = play(
      { type: 'newGame', playerColor: 'black', ask: true },
      { type: 'newGame', playerColor: 'white', ask: false },
      { type: 'reply', game: 1, after: [], uci: 'e2e4' },
    );
    expect(state).toMatchObject({ game: 2, playerColor: 'white', line: [], maia: { status: 'idle' } });
  });

  it("applies only the latest game's answer when Black starts twice", () => {
    const state = play(
      { type: 'newGame', playerColor: 'black', ask: true },
      { type: 'newGame', playerColor: 'black', ask: true },
      { type: 'reply', game: 1, after: [], uci: 'e2e4' },
      { type: 'reply', game: 2, after: [], uci: 'd2d4' },
    );
    expect(state).toMatchObject({ line: ['d2d4'], ply: 1, maia: { status: 'idle' } });
  });

  it("drops an earlier game's failure, and retries the line that failed", () => {
    const error = new Error('down');
    const stale = play(
      { type: 'move', line: ['e2e4'], ask: true },
      { type: 'newGame', playerColor: 'white', ask: false },
      { type: 'failed', game: 0, after: ['e2e4'], error },
    );
    expect(stale.maia).toEqual({ status: 'idle' });

    const failed = play(
      { type: 'move', line: ['e2e4'], ask: true },
      { type: 'failed', game: 0, after: ['e2e4'], error },
    );
    expect(failed.maia).toEqual({ status: 'failed', error });
    expect(gameReducer(failed, { type: 'retry' })).toMatchObject({
      line: ['e2e4'],
      maia: { status: 'thinking' },
    });
  });

  it('drops the answer to a move the player took back and replaced', () => {
    const state = play(
      { type: 'move', line: ['e2e4'], ask: true },
      { type: 'goto', ply: 0 },
      { type: 'move', line: ['d2d4'], ask: true },
      { type: 'reply', game: 0, after: ['e2e4'], uci: 'e7e5' },
    );
    expect(state).toMatchObject({ line: ['d2d4'], maia: { status: 'thinking' } });
    expect(gameReducer(state, { type: 'reply', game: 0, after: ['d2d4'], uci: 'd7d5' })).toMatchObject(
      { line: ['d2d4', 'd7d5'], ply: 2, maia: { status: 'idle' } },
    );
  });

  it('stops thinking when a new game as White starts', () => {
    const state = play(
      { type: 'move', line: ['e2e4'], ask: true },
      { type: 'newGame', playerColor: 'white', ask: false },
    );
    expect(state).toMatchObject({ line: [], ply: 0, maia: { status: 'idle' } });
  });

  it('leaves the board where the player is looking when Maia answers', () => {
    const viewing: GameState = play(
      { type: 'move', line: ['e2e4'], ask: true },
      { type: 'goto', ply: 0 },
    );
    expect(gameReducer(viewing, { type: 'reply', game: 0, after: ['e2e4'], uci: 'e7e5' })).toMatchObject(
      { line: ['e2e4', 'e7e5'], ply: 0 },
    );
  });

  it('keeps goto within the moves played', () => {
    const state = play({ type: 'move', line: ['e2e4'], ask: false });
    expect(gameReducer(state, { type: 'goto', ply: -3 }).ply).toBe(0);
    expect(gameReducer(state, { type: 'goto', ply: 9 }).ply).toBe(1);
  });
});

describe('awaitsMaia', () => {
  it('asks Maia to open only when the player is Black', () => {
    expect(awaitsMaia(position([]), 'black')).toBe(true);
    expect(awaitsMaia(position([]), 'white')).toBe(false);
  });

  it("doesn't ask once the game is over", () => {
    // Fool's mate: Black mates on move 2, so White's turn never comes.
    expect(awaitsMaia(position(['f2f3', 'e7e5', 'g2g4', 'd8h4']), 'black')).toBe(false);
  });
});
