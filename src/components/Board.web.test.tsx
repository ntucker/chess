import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import type { Drawing } from '@/board/drawing';

import Board, { type BoardProps } from './Board';

// Chessground in jsdom, with the browser's parts it needs played by hand: the
// board's size, ResizeObserver (chessground's observer was made first, so it
// hears first) and animation frames, which run only when a test says so.
let size = 320;
const frames = new Map<number, FrameRequestCallback>();
let lastFrame = 0;
const observers: ResizeObserverCallback[] = [];
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Runs the frames asked for so far, late enough to finish any slide. */
const frame = () =>
  act(() => {
    const now = performance.now() + 1000;
    const due = [...frames.values()];
    frames.clear();
    for (const callback of due) callback(now);
  });

/** Resizes the board, as a screen covering it (0) or leaving it does. */
const resize = (to: number) =>
  act(() => {
    size = to;
    const entries = [
      { contentRect: { width: size, height: size } },
    ] as unknown as ResizeObserverEntry[];
    for (const callback of observers) callback(entries, {} as ResizeObserver);
  });

/** Every SVG attribute chessground wrote with NaN in it. */
const nans = () =>
  [...document.querySelectorAll('cg-container svg *')].flatMap((el) =>
    [...el.attributes]
      .filter((a) => a.value.includes('NaN'))
      .map((a) => `<${el.tagName} ${a.name}="${a.value}">`),
  );

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
const board = (props: Partial<BoardProps> = {}): BoardProps => ({
  fen: START,
  orientation: 'white',
  turnColor: 'white',
  dests: {},
  check: false,
  onMove: () => {},
  ...props,
});

let root: Root;
beforeEach(() => {
  size = 320;
  frames.clear();
  observers.length = 0;
  window.requestAnimationFrame = (callback) => {
    frames.set(++lastFrame, callback);
    return lastFrame;
  };
  window.cancelAnimationFrame = (id) => frames.delete(id ?? 0);
  window.ResizeObserver = class {
    constructor(callback: ResizeObserverCallback) {
      observers.push(callback);
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.getBoundingClientRect = () => new DOMRect(0, 0, size, size);
  root = createRoot(document.body.appendChild(document.createElement('div')));
});
afterEach(() => act(() => root.unmount()));

describe('a board covered while chessground has a redraw queued', () => {
  it.each<[string, Drawing[], string]>([
    [
      'free play',
      [{ kind: 'badge', square: 'e4', quality: 'best' }],
      'svg.cg-custom-svgs g[transform]',
    ],
    ['the lesson', [{ kind: 'arrow', from: 'c7', to: 'c6', tone: 'main' }], 'svg.cg-shapes line'],
  ])('draws nothing at NaN in %s, and draws again once uncovered', async (_, drawings, drawn) => {
    act(() => root.render(<Board {...board()} />));
    frame();
    // The move slides, and its drawings are set, on frames still to come.
    act(() =>
      root.render(
        <Board
          {...board({ fen: AFTER_E4, turnColor: 'black', lastMove: ['e2', 'e4'], drawings })}
        />,
      ),
    );
    resize(0);
    frame();
    frame();
    expect(nans()).toEqual([]);

    resize(320);
    frame();
    frame();
    expect(nans()).toEqual([]);
    expect(document.querySelector(drawn)).not.toBeNull();
  });
});

describe("a game's ending", () => {
  // Fool's mate: the learner, White, is mated.
  const MATED = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3';
  const ending = {
    mood: 'lost',
    reason: 'checkmate',
    kings: { learner: 'e1', rival: 'e8' },
  } as const;
  const spot = () => {
    const veil = document.querySelector<HTMLElement>('cg-ending .veil')!;
    return [veil.style.getPropertyValue('--spot-x'), veil.style.getPropertyValue('--spot-y')];
  };

  beforeEach(() => {
    window.matchMedia = (query) => ({ matches: false, media: query }) as MediaQueryList;
  });

  it('moves its light with the learner’s king when the board turns around', () => {
    act(() => root.render(<Board {...board({ fen: MATED, check: true, ending })} />));
    frame();
    expect(spot()).toEqual(['56.25%', '93.75%']);

    act(() =>
      root.render(<Board {...board({ fen: MATED, check: true, ending, orientation: 'black' })} />),
    );
    frame();
    expect(document.querySelectorAll('cg-ending')).toHaveLength(1);
    expect(spot()).toEqual(['43.75%', '6.25%']);
  });
});
