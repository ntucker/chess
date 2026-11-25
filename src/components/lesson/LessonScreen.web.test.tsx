import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';

import { haptic } from '@/components/haptics';
import { PHONE_QUERY, useLayout } from '@/theme/Narrow';

import { LessonPage } from './LessonScreen';

// The screen's frame and blocks are stood in for: these tests are about which
// layout it picks, and what that leaves mounted, not about what each draws.
jest.mock('@data-client/react', () => ({
  AsyncBoundary: ({ children }: { children: ReactNode }) => children,
  useFetch: () => {},
  useSuspense: () => undefined,
}));
jest.mock('@/components/OpponentPicker', () => ({
  OpponentPicker: () => null,
  useOpponentDownload: () => undefined,
}));
jest.mock('./useOpeningsGame', () => ({
  useOpeningsGame: () => ({
    store: [{ moves: [], ply: 0 }, () => {}],
    lesson: undefined,
    side: 'black',
    pending: false,
    playAs: () => {},
  }),
}));
let mockStarted = true;
jest.mock('./useLessonScreen', () => ({
  useLessonScreen: () => ({ board: { rival: {} }, stepper: { started: mockStarted }, header: {} }),
}));
jest.mock('@/components/navigation', () => ({ useNavigating: () => false }));
jest.mock('expo-router', () => ({ useIsFocused: () => true }));
jest.mock('@/components/useBackToReview', () => ({ useBackToReview: () => undefined }));
jest.mock('@/components/haptics', () => ({ haptic: jest.fn() }));

let mockBoardMounts = 0;
let mockStepper: { onToggle: () => void; disabled: boolean } | undefined;
let mockPagerReaches: boolean | undefined;
let mockOpenSettings: (() => void) | undefined;
let mockFlickUp: (() => void) | undefined;
jest.mock('@/components/Stage', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    Stage: ({
      board,
      program,
      header,
    }: {
      board: ReactNode;
      program: ReactNode;
      header: { narrowButton: { onPress: () => void } };
    }) => {
      mockOpenSettings = header.narrowButton.onPress;
      return (
        <>
          {board}
          {program}
        </>
      );
    },
    BoardColumn: ({
      stepperMiddle,
      onFlickUp,
    }: {
      stepperMiddle: ReactNode;
      onFlickUp?: () => void;
    }) => {
      mockFlickUp = onFlickUp;
      useEffect(() => {
        mockBoardMounts += 1;
      }, []);
      return stepperMiddle;
    },
    BoardColumnPlaceholder: () => null,
  };
});
jest.mock('@/components/ScoresheetPage', () => ({
  ScoresheetOpener: (props: { onToggle: () => void; disabled: boolean }) => {
    mockStepper = props;
    return null;
  },
}));
jest.mock('./layouts/PhoneLesson', () => ({
  PhoneLesson: ({ page, scoresheetReachable }: { page: string; scoresheetReachable: boolean }) => {
    mockPagerReaches = scoresheetReachable;
    return `phone${page === 'scoresheet' ? ' scoresheet' : ''}`;
  },
}));
jest.mock('./layouts/WideLesson', () => ({ WideLesson: () => 'wide' }));
jest.mock('./LessonSettings', () => ({
  LessonSettings: ({ open }: { open: boolean }) => (open ? ' settings' : null),
}));
jest.mock('./SourceCredits', () => ({ SourceCredits: () => null }));

/** A window whose width is `phone` or not, which a test can change. */
const screen = { phone: false, changes: new Set<() => void>() };
const resize = (phone: boolean) =>
  act(() => {
    screen.phone = phone;
    screen.changes.forEach((change) => change());
  });

let host: HTMLElement;
let root: Root;
const shown = () => host.textContent;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  jest.spyOn(window, 'matchMedia').mockImplementation(
    (media) =>
      ({
        get matches() {
          return media === PHONE_QUERY && screen.phone;
        },
        addEventListener: (_: string, change: () => void) => screen.changes.add(change),
        removeEventListener: (_: string, change: () => void) => screen.changes.delete(change),
      }) as unknown as MediaQueryList,
  );
  host = document.createElement('div');
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  jest.restoreAllMocks();
  screen.phone = false;
  mockBoardMounts = 0;
  mockFlickUp = undefined;
  mockStarted = true;
});

const open = (phone: boolean) => {
  screen.phone = phone;
  return act(async () => root.render(<LessonPage />));
};

describe('LessonScreen', () => {
  it("draws a phone's panel from the first render, never the wide one first", async () => {
    await open(true);
    expect(shown()).toBe('phone');
  });

  it('swaps the panel as the window crosses the width, keeping the board mounted', async () => {
    await open(false);
    expect(shown()).toBe('wide');
    await resize(true);
    expect(shown()).toBe('phone');
    await resize(false);
    expect(shown()).toBe('wide');
    expect(mockBoardMounts).toBe(1);
  });

  it("shuts a phone's scoresheet and settings while the window is wide, keeping the board", async () => {
    await open(true);
    act(() => {
      mockStepper!.onToggle();
      mockOpenSettings!();
    });
    expect(shown()).toBe('phone scoresheet settings');
    await resize(false);
    expect(shown()).toBe('wide');
    // Opened on the phone, they show again once it narrows.
    await resize(true);
    expect(shown()).toBe('phone scoresheet settings');
    expect(mockBoardMounts).toBe(1);
  });

  it('reaches the scoresheet from the first move, and keeps it showing when a new game empties it', async () => {
    mockStarted = false;
    await open(true);
    expect(mockStepper!.disabled).toBe(true);
    expect(mockPagerReaches).toBe(false);
    mockStarted = true;
    await open(true);
    expect(mockStepper!.disabled).toBe(false);
    act(() => mockStepper!.onToggle());
    mockStarted = false;
    await open(true);
    expect(shown()).toBe('phone scoresheet');
    expect(mockStepper!.disabled).toBe(false);
    expect(mockPagerReaches).toBe(true);
  });

  it('opens the settings with a flick up from the bar under the board, on a phone only', async () => {
    await open(false);
    expect(mockFlickUp).toBeUndefined();
    await resize(true);
    expect(shown()).toBe('phone');
    jest.mocked(haptic).mockClear();
    act(() => mockFlickUp!());
    expect(shown()).toBe('phone settings');
    expect(haptic).toHaveBeenCalledWith('sheetOpened');
  });
});

describe('useLayout', () => {
  function Probe() {
    return useLayout();
  }

  // Calling it in a page's pre-rendered frame fails the export, rather than draw a layout that may be wrong.
  it('throws when rendered with no window, as in the static export', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderToString(<Probe />)).toThrow(/BrowserOnly/);
  });
});
