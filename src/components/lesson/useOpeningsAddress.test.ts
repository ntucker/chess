import { describe, expect, it } from '@jest/globals';

import { focusedRoute } from './useOpeningsAddress';

describe('focusedRoute', () => {
  it("reads the focused route of the layout's own navigator, whatever is pushed on top", () => {
    const lesson = { key: 'lesson-1', params: { id: 'slav' } };
    const root = {
      index: 1,
      routes: [
        { key: 'openings-layout', state: { index: 1, routes: [{ key: 'index-0' }, lesson] } },
        { key: 'list' },
      ],
    };
    expect(focusedRoute(root, 'openings-layout')).toBe(lesson);
    // A state not yet rehydrated has no index: its last route is focused.
    expect(
      focusedRoute({ routes: [{ key: 'l', state: { routes: [{ key: 'a' }, { key: 'b' }] } }] }, 'l')
        ?.key,
    ).toBe('b');
    expect(focusedRoute({ routes: [{ key: 'l' }] }, 'l')).toBeUndefined();
  });
});
