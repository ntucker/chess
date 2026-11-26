import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SilkProvider } from '@reactive/silk-native';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import type { PhonePage } from '@/components/PhonePages';
import { themes } from '@/theme/theme';

import type { LessonScreenModel } from '../useLessonScreen';

import { type LessonPageName, PhoneLesson } from './PhoneLesson';

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
let mockListProps: { onPlay: (line: readonly string[]) => void } | undefined;
jest.mock('../OpportunityList', () => ({
  OpportunityList: (props: typeof mockListProps) => {
    mockListProps = props;
    return 'opportunities';
  },
}));
jest.mock('../TrapCard', () => ({ TrapCard: () => <span data-testid="trap" /> }));
jest.mock('./LessonHeadline', () => ({ LessonHeadline: () => null }));
jest.mock('@/components/ScoresheetPage', () => ({ ScoresheetPage: () => 'scoresheet' }));
jest.mock('@/components/ReviewLinks', () => ({ ScoresheetReview: () => null }));

const MODEL = {
  moves: {},
  idea: {},
  status: { news: 'all', pastGuide: false },
  headline: {},
  scoresheet: {},
  review: { button: { href: '/review', started: false }, offered: false },
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
  mockListProps = undefined;
});

const render = (
  page: PhonePage<LessonPageName>,
  model = MODEL,
  onPage: (page: PhonePage<LessonPageName>) => void = () => {},
) =>
  act(() =>
    root.render(
      <SilkProvider theme={themes.dark}>
        <PhoneLesson model={model} page={page} onPage={onPage} scoresheetReachable />
      </SilkProvider>,
    ),
  );

/** The pager's page whose text is `text`, of two pages, or of `count`. */
const pageOf = (text: string, count = 2) =>
  [
    ...host.querySelectorAll<HTMLElement>(`[style*="width: ${String(100 / count).slice(0, 5)}"]`),
  ].find((page) => page.textContent === text)!;
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

  it('shows a dot for each page, so a page a swipe away reads as there', () => {
    const dots = () => host.querySelector('[data-testid="page-dots"]')!.childElementCount;
    render('lesson');
    expect(dots()).toBe(2);
    render('lesson', {
      ...MODEL,
      opportunities: { onPlay: () => {}, lesson: {} },
    } as unknown as LessonScreenModel);
    expect(dots()).toBe(3);
  });

  it('leaves out the panes when there are neither moves nor an idea, as Practice can', () => {
    render('lesson', { ...MODEL, moves: null, idea: null });
    expect(pageOf('').childElementCount).toBe(0);
  });

  describe('with opportunities', () => {
    const onPlay = jest.fn<(line: readonly string[]) => void>();
    const model = {
      ...MODEL,
      opportunities: { onPlay, lesson: {} },
    } as unknown as LessonScreenModel;

    it('lists them one swipe before the lesson, only once their page shows, then keeps them', () => {
      render('lesson', model);
      expect(pageOf('', 3)).toBeDefined();
      expect(mockListProps).toBeUndefined();
      render('opportunities', model);
      expect(hidden(pageOf('opportunities', 3))).toBe(false);
      render('lesson', model);
      expect(hidden(pageOf('opportunities', 3))).toBe(true);
    });

    it("waits for another lesson's page to show before listing that lesson", () => {
      render('opportunities', model);
      render('lesson', model);
      mockListProps = undefined;
      const next = {
        ...model,
        opportunities: { onPlay, lesson: {} },
      } as unknown as LessonScreenModel;
      render('lesson', next);
      expect(mockListProps).toBeUndefined();
      render('opportunities', next);
      expect(mockListProps).toBeDefined();
    });

    it('plays a row picked and goes back to the lesson, where the cue shows', () => {
      const onPage = jest.fn();
      render('opportunities', model, onPage);
      act(() => mockListProps!.onPlay(['e2e4']));
      expect(onPlay).toHaveBeenCalledWith(['e2e4']);
      expect(onPage).toHaveBeenCalledWith('lesson');
    });
  });
});
