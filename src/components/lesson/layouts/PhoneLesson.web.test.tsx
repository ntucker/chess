import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SilkProvider } from '@reactive/silk-native';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { themes } from '@/theme/theme';

import type { LessonScreenModel } from '../useLessonScreen';
import { PhoneLesson, type PhonePage } from './PhoneLesson';

// The blocks are stood in for: these tests are about what the layout keeps
// mounted, not about what each block draws.
let mockMovesMounts = 0;
jest.mock('../CandidateList', () => {
  const { useState } = jest.requireActual<typeof import('react')>('react');
  return {
    COMPACT_INSET: 8,
    // Counts real mounts, which a page sliding out of view mustn't cause.
    CandidateList: () => {
      useState(() => {
        mockMovesMounts += 1;
      });
      return 'moves';
    },
  };
});
jest.mock('../IdeaCard', () => ({ IdeaCard: () => 'idea', IdeaAside: () => 'aside' }));
jest.mock('../TrapCard', () => ({ TrapCard: () => <span data-testid="trap" /> }));
jest.mock('./LessonHeadline', () => ({ LessonHeadline: () => null }));
jest.mock('@/components/ScoresheetDrawer', () => ({ ScoresheetPage: () => 'scoresheet' }));
jest.mock('@/components/ReviewLinks', () => ({ ScoresheetReview: () => null }));

const MODEL = {
  moves: {},
  idea: {},
  status: { news: 'all', pastGuide: false },
  headline: {},
  scoresheet: {},
  review: { href: '/review', shut: false },
  onLeave: () => {},
} as unknown as LessonScreenModel;

let host: HTMLElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  mockMovesMounts = 0;
});

const render = (page: PhonePage, model = MODEL) =>
  act(() =>
    root.render(
      <SilkProvider theme={themes.dark}>
        <PhoneLesson model={model} page={page} onPage={() => {}} scoresheetReachable />
      </SilkProvider>,
    ),
  );

/** The pager's page whose text is `text`. */
const pageOf = (text: string) =>
  [...host.querySelectorAll<HTMLElement>('[style*="width: 50%"]')].find(
    (page) => page.textContent === text,
  )!;
const hidden = (page: HTMLElement) => page.hasAttribute('inert');

describe('PhoneLesson', () => {
  it('shows the page it is given, keeping the other mounted and hidden', () => {
    render('lesson');
    expect(hidden(pageOf('movesidea'))).toBe(false);
    expect(hidden(pageOf('scoresheet'))).toBe(true);
    render('scoresheet');
    expect(hidden(pageOf('movesidea'))).toBe(true);
    expect(hidden(pageOf('scoresheet'))).toBe(false);
    render('lesson');
    expect(hidden(pageOf('scoresheet'))).toBe(true);
    expect(mockMovesMounts).toBe(1);
  });

  it('warns of a trap above the pages, where the panel scrolls, over either page', () => {
    for (const page of ['lesson', 'scoresheet'] as const) {
      render(page, { ...MODEL, trap: {} } as LessonScreenModel);
      const trap = host.querySelector('[data-testid="trap"]')!;
      expect(trap).not.toBeNull();
      for (const text of ['movesidea', 'scoresheet']) {
        // Outside the page, and before it.
        expect(pageOf(text).contains(trap)).toBe(false);
        expect(
          trap.compareDocumentPosition(pageOf(text)) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
      }
    }
  });

  it('leaves out the panes when there are neither moves nor an idea, as Practice can', () => {
    render('lesson', { ...MODEL, moves: null, idea: null });
    expect(pageOf('').childElementCount).toBe(0);
  });
});
