import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SilkProvider } from '@reactive/silk-native';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { themes } from '@/theme/theme';

import type { LessonScreenModel } from '../useLessonScreen';
import { PhoneLesson } from './PhoneLesson';

// The blocks are stood in for: these tests are about what the layout keeps
// mounted, not about what each block draws.
let mockMovesMounts = 0;
jest.mock('../CandidateList', () => {
  const { useState } = jest.requireActual<typeof import('react')>('react');
  return {
    COMPACT_INSET: 8,
    // Counts states made, which a hidden Activity keeps (its effects it unmounts).
    CandidateList: () => {
      useState(() => {
        mockMovesMounts += 1;
      });
      return 'moves';
    },
  };
});
jest.mock('../IdeaCard', () => ({ IdeaCard: () => 'idea', IdeaAside: () => 'aside' }));
jest.mock('./LessonHeadline', () => ({ LessonHeadline: () => null }));
jest.mock('@/components/ScoresheetDrawer', () => ({ ScoresheetDrawer: () => 'scoresheet' }));
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

const render = (scoresheetOpen: boolean) =>
  act(() =>
    root.render(
      <SilkProvider theme={themes.dark}>
        <PhoneLesson model={MODEL} scoresheetOpen={scoresheetOpen} onCloseScoresheet={() => {}} />
      </SilkProvider>,
    ),
  );

describe('PhoneLesson', () => {
  it('hides the panes under the scoresheet, keeping them mounted', () => {
    render(false);
    expect(host.textContent).toContain('moves');
    render(true);
    const panes = [...host.querySelectorAll('div')].find((div) => div.textContent === 'movesidea')!;
    expect(getComputedStyle(panes).display).toBe('none');
    expect(host.textContent).toContain('scoresheet');
    render(false);
    expect(host.textContent).not.toContain('scoresheet');
    expect(mockMovesMounts).toBe(1);
  });
});
