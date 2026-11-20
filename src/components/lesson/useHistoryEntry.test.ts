import { describe, expect, it } from '@jest/globals';

import { focusedKey } from './useHistoryEntry';

describe('focusedKey', () => {
  it("reads the focused route of the layout's own navigator, whatever is pushed on top", () => {
    const root = {
      index: 1,
      routes: [
        {
          key: 'openings-layout',
          state: { index: 1, routes: [{ key: 'index-0' }, { key: 'lesson-1' }] },
        },
        { key: 'list' },
      ],
    };
    expect(focusedKey(root, 'openings-layout')).toBe('lesson-1');
    // A state not yet rehydrated has no index: its last route is focused.
    expect(
      focusedKey({ routes: [{ key: 'l', state: { routes: [{ key: 'a' }, { key: 'b' }] } }] }, 'l'),
    ).toBe('b');
    expect(focusedKey({ routes: [{ key: 'l' }] }, 'l')).toBeUndefined();
  });
});
