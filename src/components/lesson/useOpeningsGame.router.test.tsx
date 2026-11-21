import { afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { router, Slot, Stack } from 'expo-router';
import { act, useLayoutEffect } from 'react';
import { createRoot, type Root } from 'test-renderer';

import { goBack, runNavigationInTransitions } from '@/components/navigation';
import { uciLine } from '@/lesson/lesson.fixture';
import { lessonHref, variationHref } from '@/lesson/openings';
import { FIXTURE_INDEX } from '@/lesson/openings.fixture';
import { LessonIndexContext, type LessonId } from '@/resources/lesson';
import { SettingsProvider } from '@/settings/SettingsProvider';

import { useOpeningsAddress } from './useOpeningsAddress';
import { useOpeningsGame } from './useOpeningsGame';

// The real router, so its keys and params are what the page gets in the app:
// a push or replace makes a new history entry, a change of variation keeps it.
import 'expo-router/build/testing-library/mocks';
import { ExpoRoot } from 'expo-router/build/ExpoRoot';
import { getMockContext } from 'expo-router/build/testing-library/mock-config';

// The app's entry (index.ts) without Expo Router's, which would render the
// app: it notes the transition mode the router would first render with.
let mockModeAtEntry: string | undefined;
jest.mock('expo-router/entry', () => {
  mockModeAtEntry = jest
    .requireActual<typeof import('expo-router/build/global-state/router')>(
      'expo-router/build/global-state/router',
    )
    .getDefaultTransitionMode();
  return {};
});

let latest: ReturnType<typeof useOpeningsGame> & { readonly id?: string };
/** The openings layout, as `src/app/(openings)/_layout.tsx` reads its address. */
function Page() {
  const { id, variation, entry } = useOpeningsAddress();
  const answer = { ...useOpeningsGame(id as LessonId | undefined, variation, entry), id };
  useLayoutEffect(() => {
    latest = answer;
  });
  return <Slot />;
}

/** The root layout's navigator. */
const RootLayout = () => <Stack screenOptions={{ headerShown: false }} />;

let root: Root | undefined;
async function open(url: string) {
  const context = getMockContext({
    _layout: RootLayout,
    '(openings)/_layout': () => (
      <LessonIndexContext value={FIXTURE_INDEX}>
        <SettingsProvider>
          <Page />
        </SettingsProvider>
      </LessonIndexContext>
    ),
    '(openings)/index': () => null,
    '(openings)/lesson/[id]': () => null,
    openings: () => null,
  });
  // As the app's entry does, before the router first renders.
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
  // Load the routes at once, as the test's context holds them, not lazily.
  process.env.EXPO_ROUTER_IMPORT_MODE = 'sync';
});
beforeEach(() => {
  // Each test starts from Expo Router's default, so only the entry sets the mode.
  router.setTransitionMode('preload-only');
});
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
});

describe('useOpeningsGame on the router', () => {
  it("runs navigation in transitions from the app's entry, before the router renders", () => {
    jest.requireActual('../../../index');
    expect(mockModeAtEntry).toBe('always');
  });

  it('keeps the game as its own picks move the address, and resumes it on Back', async () => {
    await open('/');
    await play('e2e4', 'c7c6');
    expect(latest.id).toBe('caro-kann');
    expect(moves()).toEqual(uciLine('e4', 'c6'));
    await run(() => latest.store[1]({ type: 'goto', ply: 0 }));
    await play('d2d4', 'd7d5', 'c2c4');
    expect(latest.id).toBe('slav');
    expect(moves()).toEqual(uciLine('d4', 'd5', 'c4'));
    await run(() => router.back());
    expect(latest.id).toBeUndefined();
    expect(moves()).toEqual([]);
  });

  it('opens a line picked from the list on the board underneath, and resumes the game on Back', async () => {
    await open(lessonHref('caro-kann'));
    await play('c7c6', 'd2d4');
    await run(() => router.push('/openings'));
    await run(() => goBack(router, '/', variationHref('caro-kann', 'advance')));
    expect(moves()).toEqual(uciLine('e4', 'c6', 'd4', 'd5', 'e5'));
    await run(() => router.back());
    expect(moves()).toEqual(uciLine('e4', 'c6', 'd4'));
    // Back left the list for good: the lesson the test opened is the first page.
    expect(router.canGoBack()).toBe(false);
  });

  it('starts the other side at `/`, not the lesson the page opened at', async () => {
    await open(lessonHref('caro-kann'));
    await run(() => latest.playAs('white'));
    expect([latest.id, moves(), latest.side]).toEqual([undefined, [], 'white']);
  });

  it('starts links to the page already open, and keeps the game dropping a variation', async () => {
    await open(lessonHref('caro-kann'));
    await play('c7c6');
    await run(() => router.navigate(variationHref('caro-kann', 'advance')));
    expect(moves()).toEqual(uciLine('e4', 'c6', 'd4', 'd5', 'e5'));
    await run(() => router.navigate(lessonHref('caro-kann')));
    expect(moves()).toEqual(uciLine('e4'));
    await run(() => router.navigate(variationHref('caro-kann', 'advance')));
    await play('c8f5');
    expect(moves()).toEqual(uciLine('e4', 'c6', 'd4', 'd5', 'e5', 'Bf5'));
    await run(() => router.navigate(lessonHref('london')));
    expect([moves(), latest.side]).toEqual([uciLine('d4'), 'white']);
    await run(() => router.navigate(variationHref('slav', 'semi-slav')));
    expect(latest.id).toBe('slav');
    expect(latest.side).toBe('black');
  });
});
