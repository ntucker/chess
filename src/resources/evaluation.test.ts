import { Controller, NetworkManager } from '@data-client/react';
import { initialState, prepareStore } from '@data-client/react/redux';
import { describe, expect, it, jest } from '@jest/globals';

import { attachStockfish } from '@/stockfish/engine';

import { getEvaluation } from './evaluation';

// Maia runs on a worklet runtime, which Jest doesn't have; only Stockfish is used here.
jest.mock('@/maia/engine', () => ({ maiaEvaluation: jest.fn() }));

// getEvaluation in a Data Client store, against a scripted Stockfish whose
// every command is recorded and whose every line the test writes.
describe('getEvaluation', () => {
  it('finishes a position the board stepped past, and keeps it', async () => {
    const { controller } = prepareStore(initialState, () => [new NetworkManager()], Controller);
    const sent: string[] = [];
    const engine = attachStockfish((command) => sent.push(command));
    engine.receive('uciok');
    /** Waits for `sent` to hold `count` copies of `command` (the store calls the endpoint asynchronously). */
    const sentTimes = async (command: string, count: number) => {
      for (let tick = 0; sent.filter((c) => c === command).length < count; tick++) {
        if (tick > 100) throw new Error(`Stockfish was never sent ${command}`);
        await new Promise((resolve) => setTimeout(resolve));
      }
    };
    /** Answers the search for `moves` once it has started `count` times. */
    const finish = async (moves: string, count: number, centipawns: number) => {
      await sentTimes(`position startpos moves ${moves}`, count);
      engine.receive(`info depth 12 score cp ${centipawns}`);
      engine.receive('bestmove a7a6');
    };

    // The board steps from the start to A, and on to B before A is done.
    const a = controller.fetch(getEvaluation, 'stockfish', ['e2e4']);
    const b = controller.fetch(getEvaluation, 'stockfish', ['e2e4', 'e7e5']);
    await sentTimes('stop', 1);
    await finish('e2e4', 1, 900); // B stopped A's search, so this answer is thrown away,
    await finish('e2e4 e7e5', 1, 40); // and B runs first.
    expect((await b).pawns).toBe(0.4);
    await finish('e2e4', 2, 25); // Then A runs again, from the start.
    expect((await a).pawns).toBe(-0.25);

    // Stepping back to A finds it in the store, with no new search.
    expect((await controller.fetchIfStale(getEvaluation, 'stockfish', ['e2e4'])).pawns).toBe(-0.25);
    expect(sent.filter((c) => c === 'position startpos moves e2e4')).toHaveLength(2);
    engine.detach();
  });
});
