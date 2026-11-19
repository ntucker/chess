import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'test-renderer';

import type { GameOpponent } from './game';
import type { Color } from './replay';
import { useGame } from './useGame';

// Labels read the evaluation engines through Data Client; these tests are
// about the opponent.
jest.mock('@/analysis/useMoveQualities', () => ({ useMoveQualities: () => [] }));

/** An opponent whose every request waits until the test answers it. */
function scripted(id: string) {
  const asked: { line: readonly string[]; answer(uci: string): void; fail(): void }[] = [];
  const opponent: GameOpponent = {
    id,
    reply: (line) =>
      new Promise((resolve, reject) => {
        asked.push({ line, answer: resolve, fail: () => reject(new Error(`${id} is down`)) });
      }),
  };
  return { opponent, asked };
}

let root: Root | undefined;
/** What useGame answered on each render; the latest last. */
const renders: ReturnType<typeof useGame>[] = [];
const game = () => renders[renders.length - 1];

function Game(props: { opponent?: GameOpponent; side: Color; active: boolean }) {
  renders.push(useGame(props.opponent, { ...props, judge: 'stockfish' }));
  return null;
}

const render = (props: Parameters<typeof Game>[0]) =>
  act(async () => {
    root ??= createRoot();
    root.render(<Game {...props} />);
  });

/** Lets the opponent's least thinking time pass and its answers arrive. */
const think = () => act(async () => jest.advanceTimersByTimeAsync(500));

beforeEach(() => {
  jest.useFakeTimers();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  renders.length = 0;
  jest.useRealTimers();
});

describe('useGame', () => {
  it("asks for White's first move only once the screen is in front", async () => {
    const maia = scripted('1500');
    await render({ opponent: maia.opponent, side: 'black', active: false });
    expect(game().thinking).toBe(true);
    expect(maia.asked).toHaveLength(0);

    await render({ opponent: maia.opponent, side: 'black', active: true });
    expect(maia.asked.map(({ line }) => line)).toEqual([[]]);
    maia.asked[0].answer('e2e4');
    await think();
    expect(game().moves).toEqual(['e2e4']);
    expect(game().thinking).toBe(false);
  });

  it('is replying only while the board shows the position the reply will follow', async () => {
    const maia = scripted('1500');
    await render({ opponent: maia.opponent, side: 'white', active: true });
    await act(async () => game().play('e2e4'));
    expect(game()).toMatchObject({ thinking: true, replying: true });
    await act(async () => game().goto(0));
    expect(game()).toMatchObject({ thinking: true, replying: false });
  });

  it('asks nobody when there is no opponent', async () => {
    await render({ side: 'black', active: true });
    expect(game().thinking).toBe(false);
    expect(game().canMove).toBe(false);
  });

  it('asks a newly chosen opponent at once, and takes the first answer', async () => {
    const maia = scripted('1500');
    const stockfish = scripted('stockfish');
    await render({ opponent: maia.opponent, side: 'white', active: true });
    await act(async () => game().move('e2', 'e4'));
    await render({ opponent: stockfish.opponent, side: 'white', active: true });
    expect(stockfish.asked.map(({ line }) => line)).toEqual([['e2e4']]);

    stockfish.asked[0].answer('c7c5');
    await think();
    expect(game().moves).toEqual(['e2e4', 'c7c5']);
    maia.asked[0].answer('e7e5');
    await think();
    expect(game().moves).toEqual(['e2e4', 'c7c5']);
  });

  it("asks a newly chosen opponent after the old one failed, and leaves the old one's failure", async () => {
    const maia = scripted('1500');
    const stockfish = scripted('stockfish');
    await render({ opponent: stockfish.opponent, side: 'white', active: true });
    await act(async () => game().move('e2', 'e4'));
    stockfish.asked[0].fail();
    await think();
    expect(game().error?.message).toBe('stockfish is down');
    expect(game().thinking).toBe(false);

    await render({ opponent: maia.opponent, side: 'white', active: true });
    expect(game().error).toBe(undefined);
    expect(game().thinking).toBe(true);
    expect(maia.asked).toHaveLength(1);
  });

  it('waits behind another screen when the opponent changes there', async () => {
    const maia = scripted('1500');
    const stockfish = scripted('stockfish');
    await render({ opponent: maia.opponent, side: 'white', active: true });
    await act(async () => game().move('e2', 'e4'));
    await render({ opponent: stockfish.opponent, side: 'white', active: false });
    expect(stockfish.asked).toHaveLength(0);
    await render({ opponent: stockfish.opponent, side: 'white', active: true });
    expect(stockfish.asked).toHaveLength(1);
  });

  it('asks again on retry', async () => {
    const maia = scripted('1500');
    await render({ opponent: maia.opponent, side: 'white', active: true });
    await act(async () => game().move('e2', 'e4'));
    maia.asked[0].fail();
    await think();
    await act(async () => game().retry());
    expect(game().error).toBe(undefined);
    expect(maia.asked.map(({ line }) => line)).toEqual([['e2e4'], ['e2e4']]);
    maia.asked[1].answer('e7e5');
    await think();
    expect(game().moves).toEqual(['e2e4', 'e7e5']);
  });

  it('drops the answer to a game since replaced, even from the same position', async () => {
    const maia = scripted('1500');
    await render({ opponent: maia.opponent, side: 'black', active: true });
    await act(async () => game().newGame());
    expect(maia.asked).toHaveLength(2);
    maia.asked[0].answer('d2d4');
    await think();
    expect(game().moves).toEqual([]);
    maia.asked[1].answer('e2e4');
    await think();
    expect(game().moves).toEqual(['e2e4']);
  });
});
