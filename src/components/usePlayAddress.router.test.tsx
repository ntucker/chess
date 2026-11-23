import { afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import { router, useIsFocused } from 'expo-router';
import { act, useLayoutEffect } from 'react';
import { createRoot, type Root } from 'test-renderer';

import { runNavigationInTransitions } from '@/components/navigation';
import { RootStack, shown } from '@/components/testing';
import { uciLine } from '@/lesson/lesson.fixture';
import { playOnHref } from '@/review/address';

import { usePlayAddress } from './usePlayAddress';

// The real router, so its keys and params are what the page gets in the app.
import 'expo-router/build/testing-library/mocks';
import { ExpoRoot } from 'expo-router/build/ExpoRoot';
import { getMockContext } from 'expo-router/build/testing-library/mock-config';

let latest: ReturnType<typeof usePlayAddress>;
/** The free-game page, as `src/app/play.tsx` reads its address; `latest` is the one in front. */
function Play() {
  const answer = usePlayAddress();
  const focused = useIsFocused();
  useLayoutEffect(() => {
    if (focused) latest = answer;
  });
  return null;
}

let root: Root | undefined;
async function open(url: string) {
  const context = getMockContext({
    _layout: RootStack,
    index: () => null,
    play: Play,
    review: () => null,
  });
  runNavigationInTransitions();
  root = createRoot();
  await act(async () => root!.render(<ExpoRoot context={context} location={url} />));
}
const moves = () => latest.store[0].moves;
const run = (step: () => void) => act(async () => step());
const play = (...ucis: string[]) =>
  run(() => {
    for (const uci of ucis) latest.store[1]({ type: 'move', uci });
  });

beforeAll(() => {
  process.env.EXPO_ROUTER_IMPORT_MODE = 'sync';
});
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
});

const CORRECTED = uciLine('e4', 'c6', 'd4', 'd5');

describe('usePlayAddress', () => {
  it('starts an empty game as White without moves in the address', async () => {
    await open('/play');
    expect([moves(), latest.side]).toEqual([[], 'white']);
  });

  it('takes the side only with moves', async () => {
    await open('/play?side=black');
    expect([moves(), latest.side]).toEqual([[], 'white']);
  });

  it('starts the moves and side the address names, up to the first illegal move', async () => {
    await open('/play?moves=e2e4 c7c6 e2e5&side=black');
    expect([moves(), latest.side]).toEqual([uciLine('e4', 'c6'), 'black']);
  });

  it('plays on from the review over it: Back returns to the review, then to the game reviewed', async () => {
    await open('/play');
    await play('e2e4', 'e7e5');
    await run(() => router.push('/review'));
    await run(() => router.push(playOnHref(CORRECTED, 'black')));
    expect([shown.path, moves(), latest.side]).toEqual(['/play', CORRECTED, 'black']);
    expect(shown.params).toMatchObject({ moves: CORRECTED.join(' '), side: 'black' });
    // A move past the line drops it, and the side, from the address.
    await play('g1f3');
    expect([shown.params.moves, shown.params.side]).toEqual([undefined, undefined]);
    await run(() => router.back());
    expect(shown.path).toBe('/review');
    await run(() => router.back());
    expect([shown.path, moves(), latest.side]).toEqual(['/play', uciLine('e4', 'e5'), 'white']);
    expect(router.canGoBack()).toBe(false);
  });

  it('plays on from a review opened on its own, over it', async () => {
    await open('/review');
    await run(() => router.push(playOnHref(CORRECTED, 'black')));
    expect([moves(), latest.side]).toEqual([CORRECTED, 'black']);
    await run(() => router.back());
    expect(shown.path).toBe('/review');
  });
});
