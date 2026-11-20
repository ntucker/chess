import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, Suspense, use, useLayoutEffect } from 'react';
import { createRoot, type Root } from 'test-renderer';

import { uciLine } from '@/lesson/lesson.fixture';
import { LESSON_INDEX, type LessonId } from '@/resources/lesson';
import { SettingsProvider, useSettings } from '@/settings/SettingsProvider';

import { useOpeningsGame } from './useOpeningsGame';

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  setParams: jest.fn(),
};
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

function Page({
  address,
  variation,
  entry,
}: {
  readonly address?: LessonId;
  readonly variation?: string;
  readonly entry: string;
}) {
  const answer = useOpeningsGame(address, variation, entry);
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

/** The history entry the page is at: its depth, as the router's keys follow the stack. */
let entry = 0;
/** The page at an address, in the same history entry: the address following the game. */
const show = (address?: LessonId, variation?: string) =>
  act(() => {
    root ??= createRoot();
    root.render(
      <SettingsProvider>
        <Page address={address} variation={variation} entry={String(entry)} />
      </SettingsProvider>,
    );
  });
/** A new history entry, or Forward to the next one: a pick from the list, or the game's own push. */
const push = (address?: LessonId, variation?: string) => {
  entry += 1;
  return show(address, variation);
};
/** Back to the history entry before. */
const back = (address?: LessonId, variation?: string) => {
  entry -= 1;
  return show(address, variation);
};
const moves = () => latest().store[0].moves;
const play = (...ucis: string[]) =>
  act(() => {
    for (const uci of ucis) latest().store[1]({ type: 'move', uci });
  });

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  entry = 0;
  jest.clearAllMocks();
  slow.lessons = false;
});

describe('useOpeningsGame', () => {
  it('starts at the line that opens the variation an address names, and keeps it while the game is that line', async () => {
    await show('caro-kann', 'advance-variation');
    expect(moves()).toEqual(uciLine('e4', 'c6', 'd4', 'd5', 'e5'));
    expect(mockRouter.setParams).not.toHaveBeenCalled();
    await play('c8f5');
    expect(mockRouter.setParams).toHaveBeenCalledWith({ variation: undefined });
    // The address dropping it keeps the game.
    await show('caro-kann');
    expect(moves()).toEqual(uciLine('e4', 'c6', 'd4', 'd5', 'e5', 'Bf5'));
  });

  it('opens a variation picked from another lesson, or of the same name in another lesson', async () => {
    await show('caro-kann');
    await play('c7c6');
    await push('caro-kann', 'classical-variation');
    expect(moves()).toEqual(uciLine('e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4'));
    await push('slav', 'semi-slav');
    expect(moves()).toEqual(
      LESSON_INDEX.slav.variations.find(({ id }) => id === 'semi-slav')!.moves,
    );
    await push('anti-london', 'main-line');
    await push('london', 'main-line');
    expect(moves()).toEqual(
      LESSON_INDEX.london.variations.find(({ id }) => id === 'main-line')!.moves,
    );
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it("starts a lesson's own start for a variation it doesn't have", async () => {
    await show('slav', 'no-such-variation');
    expect(moves()).toEqual(uciLine('d4', 'd5', 'c4'));
  });

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
    await push('caro-kann');
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

  it('resumes the game a history entry had on Back and Forward, or starts its address', async () => {
    await show();
    await play('e2e4', 'c7c6');
    await act(() => latest().store[1]({ type: 'goto', ply: 1 }));
    await push('caro-kann');
    await back();
    expect(moves()).toEqual([]);
    await push('caro-kann');
    expect(latest().store[0]).toEqual({ moves: ['e2e4', 'c7c6'], ply: 1 });
    await push('slav');
    expect(moves()).toEqual(['d2d4', 'd7d5', 'c2c4']);
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('tells apart lessons of the two sides that share moves', async () => {
    await show('anti-london');
    await play('c7c5');
    await push('london');
    expect(moves()).toEqual(uciLine('d4'));
    await back('anti-london');
    expect(moves()).toEqual(uciLine('d4', 'd5', 'Bf4', 'c5'));
  });

  it('resumes the game left for another line of the same opening, on Back', async () => {
    await show('caro-kann');
    await play('c7c6', 'd2d4', 'd7d5', 'b1c3');
    await push('caro-kann', 'advance-variation');
    expect(moves()).toEqual(uciLine('e4', 'c6', 'd4', 'd5', 'e5'));
    await back('caro-kann');
    expect(moves()).toEqual(uciLine('e4', 'c6', 'd4', 'd5', 'Nc3'));
    await push('caro-kann', 'advance-variation');
    expect(moves()).toEqual(uciLine('e4', 'c6', 'd4', 'd5', 'e5'));
    // A move past the line drops it from the address, in the same entry.
    await play('c8f5');
    await show('caro-kann');
    await back('caro-kann');
    expect(moves()).toEqual(uciLine('e4', 'c6', 'd4', 'd5', 'Nc3'));
    // Picking the line again starts it afresh.
    await push('caro-kann', 'advance-variation');
    expect(moves()).toEqual(uciLine('e4', 'c6', 'd4', 'd5', 'e5'));
  });

  it('returns to the start when a first move picks no lesson', async () => {
    await show();
    await push('caro-kann');
    await act(() => latest().store[1]({ type: 'goto', ply: 0 }));
    await play('g1f3');
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
    // Arriving there keeps the game.
    await show();
    expect(moves()).toEqual(['g1f3']);
  });

  it("keeps the start's game when a lesson after it starts the other side", async () => {
    await show();
    await play('g1f3');
    await push('caro-kann');
    await play('c7c6');
    await act(() => latest().playAs('white'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
    await show();
    expect(moves()).toEqual([]);
    // Back to the entry before: its game, not the one the side's start replaced.
    await back();
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
    await push('caro-kann');
    await back();
    expect(moves()).toEqual([]);
    expect(latest().pending).toBe(false);
  });

  it("drops the learner's moves and steps while the page shows an older game", async () => {
    slow.lessons = true;
    await show();
    await play('e2e4');
    await push('caro-kann');
    expect(latest().pending).toBe(true);
    // The page shows the start, but the game is 1.e4's. Applied to it, this
    // step to the start and then 1.d4 d5 2.c4 would replace e4 and pick the Slav.
    act(() => latest().store[1]({ type: 'goto', ply: 0 }));
    await play('d2d4', 'd7d5', 'c2c4');
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(latest().lesson).toBeUndefined();
    // Back to the start: the page shows the game again, and takes moves.
    await back();
    expect(latest().pending).toBe(false);
    slow.lessons = false;
    await play('d2d4', 'd7d5', 'c2c4');
    expect(mockRouter.push).toHaveBeenLastCalledWith('/lesson/slav');
  });

  it("plays a lesson's address from its side, and keeps that side at the start", async () => {
    await show();
    expect(latest().side).toBe('black');
    await push('london');
    expect(latest().side).toBe('white');
    expect(moves()).toEqual(['d2d4']);
    // The address saves its side, so a reload at the start agrees.
    expect(latest().setting).toBe('white');
    // A first move that picks no White lesson returns to a White start.
    await act(() => latest().store[1]({ type: 'goto', ply: 0 }));
    await play('e2e4');
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
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

  it('keeps the shown side and the saved one together through Forward and Back after a swap', async () => {
    await show();
    await play('e2e4', 'c7c6');
    await show('caro-kann');
    await act(() => latest().store[1]({ type: 'goto', ply: 0 }));
    await act(() => latest().playAs('white'));
    // In the same history entry, as a new move would, so no Forward returns to the lesson left.
    expect(mockRouter.replace).toHaveBeenLastCalledWith('/');
    await show();
    expect([latest().side, latest().setting]).toEqual(['white', 'white']);
    // Forward to the Caro-Kann plays it as Black, and Back keeps Black.
    await show('caro-kann');
    expect([latest().side, latest().setting]).toEqual(['black', 'black']);
    await show();
    expect([latest().side, latest().setting]).toEqual(['black', 'black']);
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
