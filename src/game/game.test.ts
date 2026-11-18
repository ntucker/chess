import { describe, expect, it } from '@jest/globals';

import { type GameAction, gameReducer, initialGame } from './game';

const play = (...actions: GameAction[]) => actions.reduce(gameReducer, initialGame);
const black: GameAction = { type: 'newGame', playerColor: 'black' };
const white: GameAction = { type: 'newGame', playerColor: 'white' };
const e4: GameAction = { type: 'move', uci: 'e2e4' };

describe('when Maia moves', () => {
  it('opens when the player is Black, and not when White', () => {
    expect(play(black).maia.status).toBe('thinking');
    expect(play(white).maia.status).toBe('idle');
  });

  it("answers the player's move", () => {
    expect(play(white, e4)).toMatchObject({ line: ['e2e4'], ply: 1, maia: { status: 'thinking' } });
  });

  it("doesn't answer a move that ends the game", () => {
    // Fool's mate, with the player as Black delivering it.
    const state = play(
      black,
      { type: 'reply', game: 1, after: [], uci: 'f2f3' },
      { type: 'move', uci: 'e7e5' },
      { type: 'reply', game: 1, after: ['f2f3', 'e7e5'], uci: 'g2g4' },
      { type: 'move', uci: 'd8h4' },
    );
    expect(state).toMatchObject({ line: ['f2f3', 'e7e5', 'g2g4', 'd8h4'], maia: { status: 'idle' } });
  });

  it('records castling the same way whoever castles', () => {
    // Italian Game: the player castles by dragging the king onto its rook,
    // and Maia answers the way lc0 writes castling.
    const line = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'd2d3', 'g8f6'];
    let state = play(
      white,
      ...line.map((uci, i): GameAction =>
        i % 2 === 0
          ? { type: 'move', uci }
          : { type: 'reply', game: 1, after: line.slice(0, i), uci },
      ),
    );
    state = gameReducer(state, { type: 'move', uci: 'e1h1' });
    state = gameReducer(state, { type: 'reply', game: 1, after: [...line, 'e1g1'], uci: 'e8h8' });
    expect(state.line.slice(-2)).toEqual(['e1g1', 'e8g8']);
  });

  it('fails on an illegal answer instead of playing it', () => {
    const state = play(white, e4, { type: 'reply', game: 1, after: ['e2e4'], uci: 'e7e4' });
    expect(state.line).toEqual(['e2e4']);
    expect(state.maia).toMatchObject({ status: 'failed', error: { message: expect.stringContaining('e7e4') } });
  });
});

describe('answers from Maia that come too late', () => {
  it('drops the opening move asked for Black after switching to White', () => {
    const state = play(black, white, { type: 'reply', game: 1, after: [], uci: 'e2e4' });
    expect(state).toMatchObject({ game: 2, playerColor: 'white', line: [], maia: { status: 'idle' } });
  });

  it("applies only the latest game's answer when Black starts twice", () => {
    const state = play(
      black,
      black,
      { type: 'reply', game: 1, after: [], uci: 'e2e4' },
      { type: 'reply', game: 2, after: [], uci: 'd2d4' },
    );
    expect(state).toMatchObject({ line: ['d2d4'], ply: 1, maia: { status: 'idle' } });
  });

  it("drops an earlier game's failure", () => {
    const state = play(white, e4, white, {
      type: 'failed',
      game: 1,
      after: ['e2e4'],
      error: new Error('down'),
    });
    expect(state.maia).toEqual({ status: 'idle' });
  });

  it('drops the answer to a move the player took back and replaced', () => {
    const state = play(
      white,
      e4,
      { type: 'goto', ply: 0 },
      { type: 'move', uci: 'd2d4' },
      { type: 'reply', game: 1, after: ['e2e4'], uci: 'e7e5' },
    );
    expect(state).toMatchObject({ line: ['d2d4'], maia: { status: 'thinking' } });
  });

  it('stops thinking when a new game as White starts', () => {
    expect(play(white, e4, white)).toMatchObject({ line: [], ply: 0, maia: { status: 'idle' } });
  });
});

describe('gameReducer', () => {
  it('retries the line that failed', () => {
    const error = new Error('down');
    const failed = play(white, e4, { type: 'failed', game: 1, after: ['e2e4'], error });
    expect(failed.maia).toEqual({ status: 'failed', error });
    expect(gameReducer(failed, { type: 'retry' })).toMatchObject({
      line: ['e2e4'],
      maia: { status: 'thinking' },
    });
  });

  it('leaves the board where the player is looking when Maia answers', () => {
    const state = play(white, e4, { type: 'goto', ply: 0 }, {
      type: 'reply',
      game: 1,
      after: ['e2e4'],
      uci: 'e7e5',
    });
    expect(state).toMatchObject({ line: ['e2e4', 'e7e5'], ply: 0 });
  });

  it('keeps goto within the moves played', () => {
    const state = play(white, e4);
    expect(gameReducer(state, { type: 'goto', ply: -3 }).ply).toBe(0);
    expect(gameReducer(state, { type: 'goto', ply: 9 }).ply).toBe(1);
  });
});

describe('move labels', () => {
  const e5: GameAction = { type: 'reply', game: 1, after: ['e2e4'], uci: 'e7e5' };

  it('labels each move as its judgement comes, in any order', () => {
    const state = play(
      white,
      e4,
      e5,
      { type: 'judged', game: 1, line: ['e2e4', 'e7e5'], quality: 'good' },
      { type: 'judged', game: 1, line: ['e2e4'], quality: 'best' },
    );
    expect(state.qualities).toEqual(['best', 'good']);
  });

  it('drops the labels of moves the player took back, and keeps the rest', () => {
    const judged = (line: string[]): GameAction => ({ type: 'judged', game: 1, line, quality: 'good' });
    const state = play(
      white,
      e4,
      e5,
      { type: 'move', uci: 'g1f3' },
      judged(['e2e4']),
      judged(['e2e4', 'e7e5']),
      judged(['e2e4', 'e7e5', 'g1f3']),
      { type: 'goto', ply: 2 },
      { type: 'move', uci: 'd2d4' },
    );
    expect(state).toMatchObject({ line: ['e2e4', 'e7e5', 'd2d4'], qualities: ['good', 'good'] });
  });

  it('drops a label for a move no longer played, or from an earlier game', () => {
    const replaced = play(white, e4, { type: 'goto', ply: 0 }, { type: 'move', uci: 'd2d4' });
    expect(
      gameReducer(replaced, { type: 'judged', game: 1, line: ['e2e4'], quality: 'blunder' }),
    ).toBe(replaced);
    const next = play(white, e4, white, e4);
    expect(gameReducer(next, { type: 'judged', game: 1, line: ['e2e4'], quality: 'blunder' })).toBe(
      next,
    );
  });

  it('starts each game with none', () => {
    const state = play(white, e4, { type: 'judged', game: 1, line: ['e2e4'], quality: 'best' }, white);
    expect(state.qualities).toEqual([]);
  });
});
