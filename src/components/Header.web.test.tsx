// Renders Silk, which ships ES modules: the web project's transformIgnorePatterns
// (package.json) lets @reactive through Babel for it.
import { describe, expect, it, jest } from '@jest/globals';
import { SilkProvider } from '@reactive/silk-native';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { readShippedLesson, shippedIds } from '@/lesson/lesson.fixture';
import { pathNames, variationPath } from '@/lesson/select';
import { NARROW_PX } from '@/theme/narrow';
import { themes } from '@/theme/theme';

import { Header, PLACE_TYPE } from './Header';

// Their font and the logo need Expo's asset registry, which the web preset doesn't resolve.
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('@/assets/images/logo-mark.png', () => 'logo-mark.png');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** The narrow part around each of the header's buttons, by the button's label. */
function buttonParts(props: Parameters<typeof Header>[0]) {
  const host = document.createElement('div');
  const root = createRoot(host);
  act(() =>
    root.render(
      <SilkProvider theme={themes.dark}>
        <Header {...props} />
      </SilkProvider>,
    ),
  );
  const parts = Object.fromEntries(
    [...host.querySelectorAll('[aria-label]')].map((button) => [
      button.getAttribute('aria-label'),
      button.closest('[data-narrow]')?.getAttribute('data-narrow'),
    ]),
  );
  act(() => root.unmount());
  return parts;
}

describe('Header', () => {
  it('keeps the source link on every page without settings', () => {
    expect(buttonParts({})).toEqual({ 'Source code on GitHub': undefined });
  });

  it('puts the settings button in the source link’s place on a narrow page', () => {
    expect(buttonParts({ onSettings: () => {} })).toEqual({
      'Source code on GitHub': 'wide-only',
      Settings: 'narrow-only',
    });
  });
});

/**
 * The width a 360px page's header leaves its place: the page less its
 * padding each side, the logo (as tall as the header), the source link or
 * the settings button in its place (both HeaderButton's size), and
 * Header.tsx's gaps of 8 and 12.
 */
const PLACE_AT_360 =
  360 -
  2 * NARROW_PX['page-space'] -
  NARROW_PX['header-height'] -
  NARROW_PX['header-button-size'] -
  8 -
  12;

describe('the narrow header place', () => {
  it("fits every shipped line's name on a 360px page by its estimate", () => {
    const tooLong = shippedIds.flatMap((id) => {
      const lesson = readShippedLesson(id);
      return Object.keys(lesson.variations)
        .map((variation) => pathNames(variationPath(lesson, variation)).at(-1)!)
        .filter(
          (name) => name.length * PLACE_TYPE.emPerCharacter * PLACE_TYPE.smallest > PLACE_AT_360,
        );
    });
    // The export measured 264 at 360px; this sum must keep up with the header's layout.
    expect(PLACE_AT_360).toBe(264);
    expect(tooLong).toEqual([]);
  });
});
