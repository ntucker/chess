import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { DataProvider } from '@data-client/react';
import { act } from 'react';
import { createRoot, type Root } from 'test-renderer';

import { maiaMove } from '@/maia/engine';
import type { Opponent } from '@/opponent/opponent';
import { attachStockfish } from '@/stockfish/engine';
import { NO_RESTARTS } from '@/stockfish/testing';

import { getEvaluation } from './evaluation';
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
    jest.mocked(maiaMove).mockResolvedValue('e2e4');
    expect(await fetchOpponentMove(controller, 1300, [])).toBe('e2e4');
  });

  it("plays Stockfish's best move, from the search that evaluated the position", async () => {
    const controller = newController();
    const sent: string[] = [];
    const engine = attachStockfish((command) => sent.push(command), NO_RESTARTS);
    engine.receive('uciok');

    // The evaluation bar judges the position,
    const evaluation = controller.fetch(getEvaluation, 'stockfish', ['e2e4']);
    await waitForSearch(sent, 'e2e4');
    engine.receive('info depth 12 score cp 30');
    engine.receive('bestmove c7c6 ponder d2d4');
    await evaluation;

    // and the opponent plays the move that search found, without searching again.
    expect(await fetchOpponentMove(controller, 'stockfish', ['e2e4'])).toBe('c7c6');
    expect(sent.filter((command) => command.startsWith('position'))).toHaveLength(1);
    engine.detach();
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
    expect(maiaMove).not.toHaveBeenCalled();
  });

  it('waits behind another screen, and starts once in front', async () => {
    await render(1300, false);
    expect(maiaMove).not.toHaveBeenCalled();
    await render(1300, true);
    expect(maiaMove).toHaveBeenCalledWith(1300, []);
  });
});
