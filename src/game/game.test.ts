import { describe, expect, it } from '@jest/globals';

import { failure, type GameAction, gameReducer, type GameState, initialGame } from './game';

const play = (...actions: GameAction[]) => actions.reduce(gameReducer, initialGame);
const e4: GameAction = { type: 'move', uci: 'e2e4' };
const MAIA = '1500';

/** The opponent's answer `uci` to the moves of `state`. */
const reply = (state: GameState, uci: string, opponent = MAIA): GameAction => ({
  type: 'reply',
  after: state.moves,
  opponent,
  uci,
});
const fail = (state: GameState, error = new Error('down'), opponent = MAIA): GameAction => ({
  type: 'failed',
  after: state.moves,
  opponent,
  error,
});

describe('when the opponent answers', () => {
  it('plays its move after the moves it was asked about', () => {
    const asked = play(e4);
    expect(gameReducer(asked, reply(asked, 'e7e5'))).toEqual({ moves: ['e2e4', 'e7e5'], ply: 2 });
  });

  // Italian Game: the player castles by dragging the king onto its rook, and
  // the opponent answers the way its engine writes castling: Maia (lc0) as the
  // king taking its rook, Stockfish as the king's two-square move.
  it.each([
    ['Maia', 'e8h8'],
    ['Stockfish', 'e8g8'],
  ])('records castling the same way whoever castles, against %s', (_, castles) => {
    const line = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'd2d3', 'g8f6'];
    let state = line.reduce(
      (game, uci, i) => gameReducer(game, i % 2 === 0 ? { type: 'move', uci } : reply(game, uci)),
      initialGame,
    );
    state = gameReducer(state, { type: 'move', uci: 'e1h1' });
    state = gameReducer(state, reply(state, castles));
    expect(state.moves.slice(-2)).toEqual(['e1g1', 'e8g8']);
  });

  it('fails on an illegal answer instead of playing it, naming who answered', () => {
    const asked = play(e4);
    const state = gameReducer(asked, reply(asked, 'e7e4', 'stockfish'));
    expect(state.moves).toEqual(['e2e4']);
    expect(state.failed).toMatchObject({
      opponent: 'stockfish',
      error: { message: expect.stringContaining('e7e4') },
    });
  });

  it('leaves the board where the player is looking', () => {
    const asked = play(e4, { type: 'goto', ply: 0 });
    expect(gameReducer(asked, reply(asked, 'e7e5'))).toMatchObject({
      moves: ['e2e4', 'e7e5'],
      ply: 0,
    });
  });
});

describe('answers that come too late', () => {
  // The reducer's one staleness check: an answer counts only while the moves
  // it answers are still the game's, the very same array.

  it('drops the answer to a move the player took back and replaced', () => {
    const asked = play(e4);
    const replaced = play(e4, { type: 'goto', ply: 0 }, { type: 'move', uci: 'd2d4' });
    expect(gameReducer(replaced, reply(asked, 'e7e5'))).toBe(replaced);
    expect(gameReducer(replaced, fail(asked))).toBe(replaced);
  });

  it("drops an earlier game's answer, even from the same position", () => {
    const first = play({ type: 'newGame' });
    const second = gameReducer(first, { type: 'newGame' });
    expect(second.moves).toEqual(first.moves);
    expect(gameReducer(second, reply(first, 'e2e4'))).toBe(second);
    expect(gameReducer(second, fail(first))).toBe(second);
  });

  it('keeps the answer to moves the player only stepped through', () => {
    const asked = play(e4);
    const stepped = gameReducer(asked, { type: 'goto', ply: 0 });
    expect(gameReducer(stepped, reply(asked, 'e7e5')).moves).toEqual(['e2e4', 'e7e5']);
  });
});

describe('failures', () => {
  it('belong to the opponent that failed, so a different one is asked', () => {
    const error = new Error('down');
    const asked = play(e4);
    const failed = gameReducer(asked, fail(asked, error, 'stockfish'));
    expect(failure(failed, 'stockfish')).toBe(error);
    expect(failure(failed, MAIA)).toBe(undefined);
    expect(failure(failed, undefined)).toBe(undefined);
    // No failure at all, even for no opponent.
    expect(failure(asked, undefined)).toBe(undefined);
  });

  it('clear on retry, keeping the moves and the board', () => {
    const asked = play(e4, { type: 'goto', ply: 0 });
    const failed = gameReducer(asked, fail(asked));
    expect(gameReducer(failed, { type: 'retry' })).toEqual({ moves: ['e2e4'], ply: 0 });
  });

  it('clear when the moves change', () => {
    const asked = play(e4);
    const failed = gameReducer(asked, fail(asked));
    expect(gameReducer(failed, { type: 'goto', ply: 0 }).failed).toBeDefined();
    expect(gameReducer(gameReducer(failed, { type: 'goto', ply: 0 }), e4).failed).toBe(undefined);
    expect(gameReducer(failed, { type: 'newGame' }).failed).toBe(undefined);
  });

  it("don't block the answer of the opponent asked next", () => {
    // A late failure from the replaced opponent, then the new one's answer.
    const asked = play(e4);
    const failed = gameReducer(asked, fail(asked, new Error('down'), 'stockfish'));
    expect(gameReducer(failed, reply(asked, 'e7e5')).moves).toEqual(['e2e4', 'e7e5']);
  });
});

describe('gameReducer', () => {
  it('returns the same state for an illegal move or a retry with nothing failed', () => {
    const started = play(e4);
    expect(gameReducer(started, { type: 'move', uci: 'e7e4' })).toBe(started);
    expect(gameReducer(started, { type: 'retry' })).toBe(started);
  });

  it('accepts a legal move for either side', () => {
    expect(play(e4, { type: 'move', uci: 'e7e5' }).moves).toEqual(['e2e4', 'e7e5']);
  });

  it('drops the moves after the shown one when a move is played there', () => {
    const state = play(e4, { type: 'move', uci: 'e7e5' }, { type: 'goto', ply: 1 }, {
      type: 'move',
      uci: 'c7c5',
    });
    expect(state).toEqual({ moves: ['e2e4', 'c7c5'], ply: 2 });
  });

  it('keeps goto within the moves played', () => {
    const state = play(e4);
    expect(gameReducer(state, { type: 'goto', ply: -3 }).ply).toBe(0);
    expect(gameReducer(state, { type: 'goto', ply: 9 }).ply).toBe(1);
  });
});

describe('a new game', () => {
  it('starts from the starting position, or having played the moves it names', () => {
    const played = play(e4, { type: 'move', uci: 'c7c6' });
    expect(gameReducer(played, { type: 'newGame' })).toEqual({ moves: [], ply: 0 });
    expect(gameReducer(played, { type: 'newGame', moves: ['d2d4'] })).toEqual({
      moves: ['d2d4'],
      ply: 1,
    });
  });
});
