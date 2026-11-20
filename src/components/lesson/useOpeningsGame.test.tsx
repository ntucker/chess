import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, Suspense, use, useLayoutEffect } from 'react';
import { createRoot, type Root } from 'test-renderer';

import type { LessonId } from '@/resources/lesson';
import { SettingsProvider, useSettings } from '@/settings/SettingsProvider';

import { useOpeningsGame } from './useOpeningsGame';

const mockRouter = { push: jest.fn(), replace: jest.fn(), dismissTo: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

let root: Root | undefined;
/** What the hook answered on each committed render; the latest last. */
const renders: (ReturnType<typeof useOpeningsGame> & { readonly setting: string })[] = [];
const latest = () => renders[renders.length - 1];

/** A lesson that never finishes loading, like a slow lesson file. */
const loadingForever = new Promise<never>(() => {});
/** Whether lessons load slowly: the page's lesson then waits forever. */
const slow = { lessons: false };

/** The page's lesson: with slow lessons, it waits once the shown game picks one. */
function Lesson({ moves }: { readonly moves: readonly string[] }) {
  if (slow.lessons && moves.length > 0) use(loadingForever);
  return 'lesson';
}

function Page({ address }: { readonly address?: LessonId }) {
  const answer = useOpeningsGame(address);
  const setting = useSettings().side;
  // On commit: a render that waits for a lesson never shows.
  useLayoutEffect(() => {
    renders.push({ ...answer, setting });
  });
  return (
    <Suspense fallback="placeholder">
      <Lesson moves={answer.store[0].moves} />
    </Suspense>
  );
}

const show = (address?: LessonId) =>
  act(() => {
    root ??= createRoot();
    root.render(
      <SettingsProvider>
        <Page address={address} />
      </SettingsProvider>,
    );
  });
const moves = () => latest().store[0].moves;
const play = (...ucis: string[]) =>
  act(() => {
    for (const uci of ucis) latest().store[1]({ type: 'move', uci });
  });

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  jest.clearAllMocks();
  slow.lessons = false;
});

describe('useOpeningsGame', () => {
  it('starts where the address says', async () => {
    await show();
    expect(moves()).toEqual([]);
    act(() => root?.unmount());
    root = undefined;
    await show('slav');
    expect(moves()).toEqual(['d2d4', 'd7d5', 'c2c4']);
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
    await play('d2d4', 'd7d5', 'c2c4');
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
    expect(moves()).toEqual(['d2d4', 'd7d5', 'c2c4']);
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

  it('moves the address at the pick, while the page shows the start until the lesson loads', async () => {
    slow.lessons = true;
    await show();
    await play('e2e4');
    expect(mockRouter.push).toHaveBeenCalledWith('/lesson/caro-kann');
    expect(moves()).toEqual([]);
    expect(latest().pending).toBe(true);
    expect(JSON.stringify(root?.container.toJSON())).not.toContain('placeholder');
    // Back while it loads: the page is at the start again, with nothing pending.
    await show('caro-kann');
    await show();
    expect(moves()).toEqual([]);
    expect(latest().pending).toBe(false);
  });

  it("drops the learner's moves and steps while the page shows an older game", async () => {
    slow.lessons = true;
    await show();
    await play('e2e4');
    await show('caro-kann');
    expect(latest().pending).toBe(true);
    // The page shows the start, but the game is 1.e4's. Applied to it, this
    // step to the start and then 1.d4 d5 2.c4 would replace e4 and pick the Slav.
    act(() => latest().store[1]({ type: 'goto', ply: 0 }));
    await play('d2d4', 'd7d5', 'c2c4');
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(latest().lesson).toBeUndefined();
    // Back to the start: the page shows the game again, and takes moves.
    await show(undefined);
    expect(latest().pending).toBe(false);
    slow.lessons = false;
    await play('d2d4', 'd7d5', 'c2c4');
    expect(mockRouter.push).toHaveBeenLastCalledWith('/lesson/slav');
  });

  it("plays a lesson's address from its side, and keeps that side at the start", async () => {
    await show();
    expect(latest().side).toBe('black');
    await show('london');
    expect(latest().side).toBe('white');
    expect(moves()).toEqual(['d2d4']);
    // Only a choice of the learner's is saved.
    expect(latest().setting).toBe('black');
    // A first move that picks no White lesson returns to a White start.
    await act(() => latest().store[1]({ type: 'goto', ply: 0 }));
    await play('e2e4');
    expect(mockRouter.dismissTo).toHaveBeenCalledWith('/');
    await show();
    expect(latest().side).toBe('white');
  });

  it('starts again from the other side when the learner plays as it', async () => {
    await show();
    await play('d2d4', 'd7d5');
    await act(() => latest().playAs('white'));
    expect(latest().side).toBe('white');
    expect(latest().setting).toBe('white');
    expect(moves()).toEqual([]);
    // Choosing the side already played keeps the game.
    await play('d2d4');
    await act(() => latest().playAs('white'));
    expect(moves()).toEqual(['d2d4']);
    expect(mockRouter.push).toHaveBeenLastCalledWith('/lesson/london');
  });

  it("shows the other side's start at once, from shared moves inside a lesson", async () => {
    slow.lessons = true;
    await show('slav');
    await act(() => latest().store[1]({ type: 'goto', ply: 2 }));
    const before = renders.length;
    await act(() => latest().playAs('white'));
    // No commit keeps the Slav's board, as a deferred copy would.
    const shown = renders.slice(before);
    expect(shown.length).toBeGreaterThan(0);
    for (const { store, side, lesson } of shown) {
      expect([store[0].moves, side, lesson]).toEqual([[], 'white', undefined]);
    }
    expect(latest().pending).toBe(false);
  });

  it('shows a move within a lesson at once', async () => {
    await show('caro-kann');
    const before = renders.length;
    await play('c7c6');
    // No commit shows the game before the move, as a deferred copy would.
    const shown = renders.slice(before).map(({ store }) => store[0].moves);
    expect(shown.length).toBeGreaterThan(0);
    for (const moves of shown) expect(moves).toEqual(['e2e4', 'c7c6']);
  });
});
