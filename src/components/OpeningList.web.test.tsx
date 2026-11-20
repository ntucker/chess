// Renders Silk, which ships ES modules: the web project's transformIgnorePatterns
// (package.json) lets @reactive through Babel for it.
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { SilkProvider } from '@reactive/silk-native';
import type { ReactNode } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { FIXTURE_INDEX } from '@/lesson/openings.fixture';
import { type ListPlace, openingList } from '@/lesson/openingList';
import { LessonIndexContext, type LessonId } from '@/resources/lesson';
import { themes } from '@/theme/theme';

import { OpeningList } from './OpeningList';

// Only the list itself: the page around it, the router and the icon font are others' tests.
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('@/components/Page', () => ({
  Page: ({ children }: { children: ReactNode }) => children,
}));
// Stage's own imports reach Reanimated, which needs a matchMedia jsdom lacks.
jest.mock('@/components/Stage', () => ({ STAGE_MAX: 1200 }));
jest.mock('expo-router', () => ({
  Link: ({ children }: { children: ReactNode }) => children,
  useRouter: () => ({}),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has no layout: the list scrolls to where the board was.
Element.prototype.scrollIntoView = () => {};

const list = openingList(FIXTURE_INDEX);
const caro = list.black.find(({ id }) => id === 'caro-kann')!.root;
const slav = list.black.find(({ id }) => id === 'slav')!.root;
const advance = caro.children.find(({ name }) => name === 'Advance Variation')!;
const short = advance.children.find(({ name }) => name === 'Short Variation')!;
let host: HTMLElement;
let root: Root | undefined;
function render(here?: ListPlace<LessonId>) {
  host = document.createElement('div');
  root = createRoot(host);
  act(() =>
    root!.render(
      <SilkProvider theme={themes.dark}>
        <LessonIndexContext value={FIXTURE_INDEX}>
          <OpeningList here={here} />
        </LessonIndexContext>
      </SilkProvider>,
    ),
  );
}
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
});

/** The names of the rows on show, in order. */
const rows = () =>
  [...host.querySelectorAll('[role=link][aria-label]')].map(
    (row) => row.getAttribute('aria-label')!.split(',')[0],
  );
/** The chevron that shows or hides the variations under `name`. */
const toggle = (name: string) =>
  host.querySelector<HTMLElement>(`[aria-label="Variations of ${name}"]`)!;

describe('OpeningList', () => {
  it('shows only the openings while the board is in none of them', () => {
    render();
    expect(rows()).toEqual(['London System', 'Caro-Kann Defence', 'Slav Defence', 'Anti-London']);
    expect(toggle('Caro-Kann Defence').getAttribute('aria-expanded')).toBe('false');
  });

  it('opens the way to the variation the board is in, and nothing else', () => {
    render({ lesson: 'caro-kann', variation: short.id });
    expect(rows()).toEqual([
      'London System',
      'Caro-Kann Defence',
      ...caro.children.flatMap((variation) => [
        variation.name,
        ...(variation === advance ? advance.children.map(({ name }) => name) : []),
      ]),
      'Slav Defence',
      'Anti-London',
    ]);
    expect(toggle(advance.name).getAttribute('aria-expanded')).toBe('true');
    expect(toggle('Slav Defence').getAttribute('aria-expanded')).toBe('false');
  });

  it('opens the variation the board is in, to show the lines under it', () => {
    render({ lesson: 'caro-kann', variation: advance.id });
    expect(rows()).toEqual(expect.arrayContaining(advance.children.map(({ name }) => name)));
  });

  it('shows and hides a branch at the learner’s press', () => {
    render({ lesson: 'caro-kann', variation: short.id });
    act(() => toggle(advance.name).click());
    expect(toggle(advance.name).getAttribute('aria-expanded')).toBe('false');
    expect(rows()).not.toContain(short.name);
    act(() => toggle('Slav Defence').click());
    expect(toggle('Slav Defence').getAttribute('aria-expanded')).toBe('true');
    expect(rows()).toEqual(expect.arrayContaining(slav.children.map(({ name }) => name)));
  });
});
