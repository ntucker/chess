// Renders Silk, which ships ES modules: the web project's transformIgnorePatterns
// (package.json) lets @reactive through Babel for it.
import { describe, expect, it, jest } from '@jest/globals';
import { SilkProvider } from '@reactive/silk-native';
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

import { reviewHref } from '@/review/address';
import { themes } from '@/theme/theme';

import { ReviewGameButton, ScoresheetReview } from './ReviewLinks';

// Its font needs Expo's asset registry, which the web preset doesn't resolve.
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const HREF = reviewHref(['e2e4', 'c7c6'], 'black', 'caro-kann');

/** Renders `children`, and hands its host to `check`. */
function render(children: ReactNode, check: (host: HTMLElement) => void) {
  const host = document.createElement('div');
  const root = createRoot(host);
  act(() => root.render(<SilkProvider theme={themes.dark}>{children}</SilkProvider>));
  check(host);
  act(() => root.unmount());
}

const reviewButton = (host: HTMLElement) =>
  host.querySelector<HTMLElement>('[role="button"][aria-label="Review the game"]');

describe('ReviewGameButton', () => {
  it('opens the review on top of the game', () => {
    mockPush.mockClear();
    render(<ReviewGameButton href={HREF} />, (host) => {
      const button = host.querySelector<HTMLElement>('[role="button"]')!;
      expect(button.textContent).toContain('Review the game');
      act(() => button.click());
    });
    expect(mockPush).toHaveBeenCalledWith(HREF);
  });
});

describe('ScoresheetReview', () => {
  it('opens the review when it has one', () => {
    mockPush.mockClear();
    render(<ScoresheetReview href={HREF} />, (host) => {
      expect(reviewButton(host)?.getAttribute('aria-disabled')).toBeNull();
      act(() => reviewButton(host)!.click());
    });
    expect(mockPush).toHaveBeenCalledWith(HREF);
  });

  it('shows disabled without one, and says why in its tip', () => {
    mockPush.mockClear();
    render(<ScoresheetReview href={HREF} disabled="Review opens once the game ends." />, (host) => {
      expect(reviewButton(host)?.getAttribute('aria-disabled')).toBe('true');
      expect(host.textContent).toContain('Review opens once the game ends.');
      act(() => reviewButton(host)!.click());
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('draws only its icon when compact, keeping its spoken name', () => {
    render(<ScoresheetReview href={HREF} compact />, (host) => {
      expect(reviewButton(host)?.textContent).toBe('');
    });
  });
});
