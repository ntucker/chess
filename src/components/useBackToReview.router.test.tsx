import { afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import { router, Slot, useIsFocused } from 'expo-router';
import { act, useLayoutEffect } from 'react';
import { createRoot, type Root } from 'test-renderer';

import { runNavigationInTransitions } from '@/components/navigation';
import type { Destination } from '@/components/PlaceLink';
import { RootStack } from '@/components/testing';
import { uciLine } from '@/lesson/lesson.fixture';
import { playOnHref, reviewHref } from '@/review/address';

import { useBackToReview } from './useBackToReview';

// The real router, so the root stack's routes are what the page gets in the app.
import 'expo-router/build/testing-library/mocks';
import { ExpoRoot } from 'expo-router/build/ExpoRoot';
import { getMockContext } from 'expo-router/build/testing-library/mock-config';

/** Each game page's back button, as of its last render in front. */
let play: Destination | undefined;
let lesson: Destination | undefined;

/** The free-game page, reading its back button as `play.tsx` does. */
function Play() {
  const back = useBackToReview();
  const focused = useIsFocused();
  useLayoutEffect(() => {
    if (focused) play = back;
  });
  return null;
}

/** The openings layout, which reads the lesson page's back button around its routes. */
function Openings() {
  const back = useBackToReview();
  const focused = useIsFocused();
  useLayoutEffect(() => {
    if (focused) lesson = back;
  });
  return <Slot />;
}

let root: Root | undefined;
async function open(url: string) {
  const context = getMockContext({
    _layout: RootStack,
    '(openings)/_layout': Openings,
    '(openings)/index': () => null,
    '(openings)/lesson/[id]': () => null,
    play: Play,
    review: () => null,
  });
  runNavigationInTransitions();
  root = createRoot();
  await act(async () => root!.render(<ExpoRoot context={context} location={url} />));
}
const run = (step: () => void) => act(async () => step());

beforeAll(() => {
  process.env.EXPO_ROUTER_IMPORT_MODE = 'sync';
});
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  play = lesson = undefined;
});

const GAME = uciLine('e4', 'c6', 'd4', 'd5');
const REVIEW = reviewHref(GAME, 'black', 'caro-kann');

describe('useBackToReview', () => {
  it('shows none on a game page opened on its own', async () => {
    await open('/play');
    expect(play).toBeUndefined();
    await run(() => router.push('/lesson/caro-kann'));
    expect(lesson).toBeUndefined();
  });

  it('leads back to the review under a game page played on from it', async () => {
    await open('/play');
    await run(() => router.push(REVIEW));
    await run(() => router.push(playOnHref(GAME, 'black')));
    expect(play).toEqual({
      href: { pathname: '/review', params: REVIEW.params },
      label: 'Back to the review',
    });
  });

  it("leads back from a lesson's page, held by the openings layout", async () => {
    await open('/');
    await run(() => router.push(REVIEW));
    await run(() => router.push(playOnHref(GAME, 'black', 'caro-kann')));
    expect(lesson?.label).toBe('Back to the review');
    // Back on the lesson's page the review opened from, nothing is under it.
    await run(() => router.back());
    await run(() => router.back());
    expect(lesson).toBeUndefined();
  });
});
