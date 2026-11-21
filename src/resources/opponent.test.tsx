import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { DataProvider } from '@data-client/react';
import { act } from 'react';
import { createRoot, type Root } from 'test-renderer';

import { maiaMove } from '@/maia/engine';
import type { Opponent } from '@/opponent/opponent';
import { fullStockfish, liteStockfish } from '@/stockfish/engine';
import { NO_RESTARTS } from '@/stockfish/testing';

import { getAnalysis } from './analysis';
import { fetchOpponentMove, useWarmOpponent } from './opponent';
import { newController, waitForSearch } from './testing';

// Maia runs on a worklet runtime, which Jest doesn't have, so it's scripted.
jest.mock('@/maia/engine', () => ({ maiaMove: jest.fn() }));

describe('fetchOpponentMove', () => {
  it("plays Maia's move at the opponent's rating", async () => {
    jest.mocked(maiaMove).mockResolvedValue('e7e5');
    const move = await fetchOpponentMove(newController(), 1300, ['e2e4']);
    expect(move).toBe('e7e5');
    expect(maiaMove).toHaveBeenCalledWith(1300, ['e2e4']);
  });

  it('asks Maia again right after a failure', async () => {
    const controller = newController();
    jest.mocked(maiaMove).mockReset().mockRejectedValueOnce(new Error('no worker'));
    await expect(fetchOpponentMove(controller, 1300, [])).rejects.toThrow('no worker');
    // A failure is stale once its millisecond has passed.
    await new Promise((resolve) => setTimeout(resolve, 2));
    jest.mocked(maiaMove).mockResolvedValue('e2e4');
    expect(await fetchOpponentMove(controller, 1300, [])).toBe('e2e4');
  });

  it("plays the first line of Stockfish's final analysis, the move the board's arrow shows", async () => {
    const controller = newController();
    const sent: string[] = [];
    const engine = liteStockfish.attach((command) => sent.push(command), NO_RESTARTS);
    engine.receive('uciok');

    // The move labels wait for the position's analysis,
    const analysis = controller.fetch(getAnalysis, 'stockfish', ['e2e4']);
    await waitForSearch(sent, 'e2e4');
    engine.receive('info depth 12 multipv 1 score cp 30 nodes 900 pv c7c6');
    engine.receive('info depth 12 multipv 2 score cp 20 nodes 900 pv e7e5');
    engine.receive('info depth 12 multipv 3 score cp 10 nodes 900 pv c7c5');
    engine.receive('bestmove c7c6 ponder d2d4');
    await analysis;

    // and the opponent plays its first move, without searching again.
    expect(await fetchOpponentMove(controller, 'stockfish', ['e2e4'])).toBe('c7c6');
    expect(sent.filter((command) => command.startsWith('position'))).toHaveLength(1);
    engine.detach();
  });

  it("plays full Stockfish's move from its own engine, apart from the bar's", async () => {
    const lite: string[] = [];
    const liteEngine = liteStockfish.attach((command) => lite.push(command), NO_RESTARTS);
    liteEngine.receive('uciok');
    const sent: string[] = [];
    const engine = fullStockfish.attach((command) => sent.push(command), NO_RESTARTS);
    engine.receive('uciok');
    // One move ranked (FULL_SEARCH).
    expect(sent).toContain('setoption name MultiPV value 1');

    const move = fetchOpponentMove(newController(), 'stockfish-full', ['e2e4']);
    await waitForSearch(sent, 'e2e4');
    engine.receive('info depth 12 multipv 1 score cp 30 nodes 900 pv e7e5');
    engine.receive('bestmove e7e5');
    expect(await move).toBe('e7e5');
    expect(lite.some((command) => command.startsWith('position'))).toBe(false);
    engine.detach();
    liteEngine.detach();
  });
});

describe('useWarmOpponent', () => {
  let root: Root | undefined;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    jest.mocked(maiaMove).mockReset().mockResolvedValue('e2e4');
  });

  afterEach(async () => {
    await act(async () => root?.unmount());
    root = undefined;
  });

  function Warm({ opponent, active }: { readonly opponent: Opponent; readonly active: boolean }) {
    useWarmOpponent(opponent, active);
    return null;
  }
  const render = (opponent: Opponent, active: boolean) =>
    act(async () => {
      root ??= createRoot();
      root.render(
        <DataProvider>
          <Warm opponent={opponent} active={active} />
        </DataProvider>,
      );
    });

  it('starts Maia on the starting position before it has to play', async () => {
    await render(1300, true);
    expect(maiaMove).toHaveBeenCalledWith(1300, []);
  });

  it('starts nothing for Stockfish', async () => {
    await render('stockfish', true);
    await render('stockfish-full', true);
    expect(maiaMove).not.toHaveBeenCalled();
  });

  it('waits behind another screen, and starts once in front', async () => {
    await render(1300, false);
    expect(maiaMove).not.toHaveBeenCalled();
    await render(1300, true);
    expect(maiaMove).toHaveBeenCalledWith(1300, []);
  });
});
