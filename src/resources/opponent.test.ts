import { Controller, NetworkManager } from '@data-client/react';
import { initialState, prepareStore } from '@data-client/react/redux';
import { describe, expect, it, jest } from '@jest/globals';

import { maiaMove } from '@/maia/engine';
import { attachStockfish } from '@/stockfish/engine';

import { getEvaluation } from './evaluation';
import { fetchOpponentMove } from './opponent';

// Maia runs on a worklet runtime, which Jest doesn't have, so it's scripted.
jest.mock('@/maia/engine', () => ({ maiaMove: jest.fn(), maiaEvaluation: jest.fn() }));

const newStore = () =>
  prepareStore(initialState, () => [new NetworkManager()], Controller).controller;

describe('fetchOpponentMove', () => {
  it("plays Maia's move at the opponent's rating", async () => {
    jest.mocked(maiaMove).mockResolvedValue('e7e5');
    const move = await fetchOpponentMove(newStore(), { engine: 'maia', rating: 1300 }, ['e2e4']);
    expect(move).toBe('e7e5');
    expect(maiaMove).toHaveBeenCalledWith(1300, ['e2e4']);
  });

  it("plays Stockfish's best move, from the search that evaluated the position", async () => {
    const controller = newStore();
    const sent: string[] = [];
    const engine = attachStockfish((command) => sent.push(command));
    engine.receive('uciok');

    // The evaluation bar judges the position,
    const evaluation = controller.fetch(getEvaluation, 'stockfish', ['e2e4']);
    for (let tick = 0; !sent.includes('position startpos moves e2e4'); tick++) {
      if (tick > 100) throw new Error('Stockfish never searched e2e4');
      await new Promise((resolve) => setTimeout(resolve));
    }
    engine.receive('info depth 12 score cp 30');
    engine.receive('bestmove c7c6 ponder d2d4');
    await evaluation;

    // and the opponent plays the move that search found, without searching again.
    const opponent = { engine: 'stockfish', rating: 1500 } as const;
    expect(await fetchOpponentMove(controller, opponent, ['e2e4'])).toBe('c7c6');
    expect(sent.filter((command) => command.startsWith('position'))).toHaveLength(1);
    engine.detach();
  });
});
