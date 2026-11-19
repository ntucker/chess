import { describe, expect, it, jest } from '@jest/globals';

import { attachStockfish } from '@/stockfish/engine';
import { NO_RESTARTS } from '@/stockfish/testing';

import { getEvaluation } from './evaluation';
import { newController, waitForSearch } from './testing';

// Maia runs on a worklet runtime, which Jest doesn't have; only Stockfish is used here.
jest.mock('@/maia/engine', () => ({ maiaEvaluation: jest.fn() }));

// getEvaluation in a Data Client store, against a scripted Stockfish whose
// every command is recorded and whose every line the test writes.
describe('getEvaluation', () => {
  it('finishes a position the board stepped past, and keeps it', async () => {
    const controller = newController();
    const sent: string[] = [];
    const engine = attachStockfish((command) => sent.push(command), NO_RESTARTS);
    engine.receive('uciok');
    /** Answers the search for `moves` once it starts. */
    const finish = async (moves: string, centipawns: number) => {
      await waitForSearch(sent, moves);
      engine.receive(`info depth 12 score cp ${centipawns}`);
      engine.receive('bestmove a7a6');
    };

    // The board steps from the start to A, and on to B before A is done.
    const a = controller.fetch(getEvaluation, 'stockfish', ['e2e4']);
    const b = controller.fetch(getEvaluation, 'stockfish', ['e2e4', 'e7e5']);
    await finish('e2e4', 25); // A finishes,
    expect((await a).pawns).toBe(-0.25);
    await finish('e2e4 e7e5', 40); // then B runs.
    expect((await b).pawns).toBe(0.4);

    // Stepping back to A finds it in the store, with no new search.
    expect((await controller.fetchIfStale(getEvaluation, 'stockfish', ['e2e4'])).pawns).toBe(-0.25);
    expect(sent.filter((c) => c === 'position startpos moves e2e4')).toHaveLength(1);
    engine.detach();
  });

  it("scores a finished game by its result, without asking the engine", async () => {
    const controller = newController();
    // Fool's mate: Black wins.
    const mated = ['f2f3', 'e7e5', 'g2g4', 'd8h4'];
    expect(await controller.fetch(getEvaluation, 'stockfish', mated)).toEqual({ score: 0, pawns: 0 });
  });
});
