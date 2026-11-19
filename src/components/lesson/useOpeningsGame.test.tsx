import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'test-renderer';

import type { LessonId } from '@/resources/lesson';

import { useOpeningsGame } from './useOpeningsGame';

const mockRouter = { push: jest.fn(), replace: jest.fn(), dismissTo: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

let root: Root | undefined;
/** What the hook answered on each render; the latest last. */
const renders: ReturnType<typeof useOpeningsGame>[] = [];
const latest = () => renders[renders.length - 1];

function Page({ address }: { readonly address?: LessonId }) {
  renders.push(useOpeningsGame(address));
  return null;
}

const show = (address?: LessonId) =>
  act(() => {
    root ??= createRoot();
    root.render(<Page address={address} />);
  });
const moves = () => latest().store[0].moves;
const play = (...ucis: string[]) =>
  act(() => {
    for (const uci of ucis) latest().store[1]({ type: 'move', uci });
  });

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  mockRouter.push.mockClear();
  mockRouter.replace.mockClear();
  mockRouter.dismissTo.mockClear();
});

describe('useOpeningsGame', () => {
  it('starts where the address says', async () => {
    await show();
    expect(moves()).toEqual([]);
    expect(latest().picked).toBe(undefined);
    act(() => root?.unmount());
    root = undefined;
    await show('slav');
    expect(moves()).toEqual(['d2d4']);
    expect(latest().picked).toBe('slav');
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it("adds a lesson's address to the history when it is picked at the start", async () => {
    await show();
    await play('e2e4');
    expect(mockRouter.push).toHaveBeenCalledWith('/lesson/caro-kann');
    // The address catching up keeps the game, moves played since included.
    await play('c7c6');
    await show('caro-kann');
    expect(moves()).toEqual(['e2e4', 'c7c6']);
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it("replaces a lesson's address when another is picked from it", async () => {
    await show('caro-kann');
    await play('c7c6');
    await act(() => latest().store[1]({ type: 'goto', ply: 0 }));
    await play('d2d4');
    expect(mockRouter.replace).toHaveBeenCalledWith('/lesson/slav');
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('starts the address’s game on Back and Forward', async () => {
    await show();
    await play('e2e4', 'c7c6');
    await show('caro-kann');
    await show();
    expect(moves()).toEqual([]);
    await show('caro-kann');
    expect(moves()).toEqual(['e2e4']);
    await show('slav');
    expect(moves()).toEqual(['d2d4']);
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('returns to the start when a first move picks no lesson', async () => {
    await show('caro-kann');
    await act(() => latest().store[1]({ type: 'goto', ply: 0 }));
    await play('g1f3');
    expect(mockRouter.dismissTo).toHaveBeenCalledWith('/');
    // Arriving there keeps the game.
    await show();
    expect(moves()).toEqual(['g1f3']);
  });
});
