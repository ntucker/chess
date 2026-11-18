import { Controller, NetworkManager } from '@data-client/react';
import { initialState, prepareStore } from '@data-client/react/redux';
import { describe, expect, it, jest } from '@jest/globals';

import { attachStockfish, SupersededError } from '@/stockfish/engine';

import { getEvaluation } from './evaluation';

// Maia runs on a worklet runtime, which Jest doesn't have; only Stockfish is used here.
jest.mock('@/maia/engine', () => ({ maiaEvaluation: jest.fn() }));

// getEvaluation in a Data Client store, against a scripted Stockfish whose
// every command is recorded and whose every line the test writes.
describe('getEvaluation', () => {
  it('evaluates a position again after a newer one replaced it', async () => {
    const { controller } = prepareStore(initialState, () => [new NetworkManager()], Controller);
    const sent: string[] = [];
    const engine = attachStockfish((command) => sent.push(command));
    engine.receive('uciok');
    const searches = (moves: string) =>
      sent.filter((command) => command === `position startpos moves ${moves}`).length;
    /** Answers the search for `moves` once it starts (the store calls the endpoint asynchronously). */
    const finish = async (moves: string, count: number, centipawns: number) => {
      for (let tick = 0; searches(moves) < count; tick++) {
        if (tick > 100) throw new Error(`Stockfish never searched ${moves} again`);
        await new Promise((resolve) => setTimeout(resolve));
      }
      engine.receive(`info depth 12 score cp ${centipawns}`);
      engine.receive('bestmove a7a6');
    };

    // The board steps from the start to A, and on to B before A is done.
    const a = controller.fetch(getEvaluation, 'stockfish', ['e2e4']);
    const b = controller.fetch(getEvaluation, 'stockfish', ['e2e4', 'e7e5']);
    await finish('e2e4', 1, 25); // B stops A's search, which then fails.
    await expect(a).rejects.toBeInstanceOf(SupersededError);
    await finish('e2e4 e7e5', 1, 40);
    expect((await b).pawns).toBe(0.4);

    // Then it steps back to A. A's failure says nothing about A, so A is
    // evaluated again (useSuspense uses the same test as fetchIfStale)
    // rather than failing again at once. Stepping takes at least 1 ms.
    await new Promise((resolve) => setTimeout(resolve, 2));
    const again = controller.fetchIfStale(getEvaluation, 'stockfish', ['e2e4']);
    await finish('e2e4', 2, -30);
    expect((await again)?.pawns).toBe(0.3);
    engine.detach();
  });
});
