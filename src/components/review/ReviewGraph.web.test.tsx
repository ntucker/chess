// Renders Silk, which ships ES modules: the web project's transformIgnorePatterns
// (package.json) lets @reactive through Babel for it.
import { describe, expect, it, jest } from '@jest/globals';
import { SilkProvider } from '@reactive/silk-native';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { replay } from '@/game/replay';
import { bookMove, judgedMove, partial, waitingMove } from '@/review/review.fixture';
import { SettingsProvider } from '@/settings/SettingsProvider';
import { themes } from '@/theme/theme';

import { type GraphView, ReviewGraph } from './ReviewGraph';

// Its badge's react-native-svg XML parser isn't what these tests look at.
jest.mock('@/components/QualityBadge', () => ({ QualityBadge: () => null }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// 1.e4 e5 2.Nf3 Nc6, the learner playing White: the guide's first two moves,
// then a mistake, then a move not judged yet.
const PLIES = replay(['e2e4', 'e7e5', 'g1f3', 'b8c6']);
const MOVES = [bookMove(0), bookMove(1), judgedMove(2, 'mistake', 0.55, 0.4), waitingMove(3)];

function view(overrides: Partial<GraphView> = {}): GraphView {
  return {
    plies: PLIES,
    ply: 3,
    moves: MOVES,
    // The last position not read yet.
    analyses: [...[0.55, 0.55, 0.55, 0.4].map((score) => partial(12, ['a', score])), undefined],
    book: ['book', 'book', undefined, undefined],
    moments: [3],
    goto: () => {},
    ...overrides,
  };
}

function render<T>(graph: GraphView, read: (host: HTMLElement) => T) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <SilkProvider theme={themes.dark}>
        <SettingsProvider>
          <ReviewGraph review={graph} learner="white" height={72} />
        </SettingsProvider>
      </SilkProvider>,
    ),
  );
  const result = read(host);
  act(() => root.unmount());
  host.remove();
  return result;
}

const slider = (host: HTMLElement) => host.querySelector<HTMLElement>('[role="slider"]')!;

describe('ReviewGraph', () => {
  it('is a slider over the moves, naming the move shown', () => {
    render(view(), (host) => {
      expect(slider(host).getAttribute('aria-label')).toBe('Graph of the game');
      expect(slider(host).getAttribute('aria-valuemin')).toBe('0');
      expect(slider(host).getAttribute('aria-valuemax')).toBe('4');
      expect(slider(host).getAttribute('aria-valuenow')).toBe('3');
      expect(slider(host).getAttribute('aria-valuetext')).toBe('2.Nf3');
    });
  });

  it('hatches the positions no analysis has read yet', () => {
    render(view(), (host) => {
      const hatched = [...host.querySelectorAll('rect')].filter((rect) =>
        rect.getAttribute('fill')?.startsWith('url('),
      );
      expect(hatched.map((rect) => [rect.getAttribute('x'), rect.getAttribute('width')])).toEqual([
        ['75%', '25%'],
      ]);
    });
  });

  it("dots the learner's moments by label, and rings the likely ones", () => {
    // White's 2.Nf3 drops 0.15: judged a mistake, a moment; not judged yet, a likely one.
    const dots = (host: HTMLElement) =>
      [...host.querySelectorAll('[data-testid^="dot-"]')].map((dot) =>
        dot.getAttribute('data-testid'),
      );
    render(view(), (host) => expect(dots(host)).toEqual(['dot-mistake']));
    const waiting = [...MOVES.slice(0, 2), waitingMove(2), waitingMove(3)];
    render(view({ moves: waiting, moments: [] }), (host) =>
      expect(dots(host)).toEqual(['dot-likely']),
    );
  });
});
