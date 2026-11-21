import { describe, expect, it, jest } from '@jest/globals';

import { type Drag, hovers, hoversControl, watchDrag, watchHoverAndTap } from './pointer';

/** Squares 10 pixels wide along one rank: x 0-9 is a1, 10-19 is b1, and so on; nothing past h1. */
const squareAt = (x: number) =>
  x >= 0 && x < 80 ? `${'abcdefgh'[Math.floor(x / 10)]}1` : undefined;

/** Moves the dragged piece can make: only onto d1. */
const plays = (_from: string, to: string) => to === 'd1';

function setup() {
  const page = new EventTarget();
  let dragging: string | undefined;
  const report = jest.fn<(drag: Drag<string> | null) => void>();
  const stop = watchDrag(page, () => dragging, squareAt, plays, report);
  const fire = (type: string, clientX = 0, isPrimary = true) =>
    page.dispatchEvent(Object.assign(new Event(type), { clientX, clientY: 0, isPrimary }));
  const drag = (from: string | undefined) => {
    dragging = from;
  };
  return { report, stop, fire, drag };
}

describe('watchDrag', () => {
  it('reports each new square a dragged piece is over once, and its own square or off the board as none', () => {
    const { report, fire, drag } = setup();
    drag('a1');
    fire('pointermove', 5);
    fire('pointermove', 15);
    fire('pointermove', 17);
    fire('pointermove', 25);
    fire('pointermove', 95);
    expect(report.mock.calls).toEqual([
      [{ from: 'a1', to: undefined }],
      [{ from: 'a1', to: 'b1' }],
      [{ from: 'a1', to: 'c1' }],
      [{ from: 'a1', to: undefined }],
    ]);
  });

  it('reports null for a drop that plays no move, and nothing for one that does', () => {
    const { report, fire, drag } = setup();
    drag('a1');
    fire('pointermove', 25);
    fire('pointerup', 25);
    expect(report.mock.lastCall).toEqual([null]);
    report.mockClear();
    fire('pointermove', 35);
    fire('pointerup', 35);
    expect(report.mock.calls).toEqual([[{ from: 'a1', to: 'd1' }]]);
    // The next drag starts afresh.
    fire('pointermove', 35);
    expect(report.mock.lastCall).toEqual([{ from: 'a1', to: 'd1' }]);
  });

  it('judges a drop by where the pointer lifts, not the last square it moved over', () => {
    const { report, fire, drag } = setup();
    drag('a1');
    fire('pointermove', 35);
    fire('pointerup', 25);
    expect(report.mock.lastCall).toEqual([null]);
    report.mockClear();
    fire('pointermove', 25);
    fire('pointerup', 35);
    expect(report.mock.calls).toEqual([[{ from: 'a1', to: 'c1' }]]);
  });

  it('reports nothing while no piece is dragged, a mouse passing over included', () => {
    const { report, fire } = setup();
    fire('pointermove', 15);
    fire('pointerup', 15);
    expect(report).not.toHaveBeenCalled();
  });

  it('ends a drag when chessground drops it, the pointer is cancelled, or it stops', () => {
    const { report, stop, fire, drag } = setup();
    drag('a1');
    fire('pointermove', 15);
    drag(undefined);
    fire('pointermove', 25);
    drag('a1');
    fire('pointermove', 35);
    fire('pointercancel', 35);
    fire('pointermove', 15);
    stop();
    fire('pointermove', 25);
    expect(report.mock.calls).toEqual([
      [{ from: 'a1', to: 'b1' }],
      [null],
      [{ from: 'a1', to: 'd1' }],
      [null],
      [{ from: 'a1', to: 'b1' }],
      [null],
    ]);
  });

  it('keeps the drag when a second finger moves or lifts', () => {
    const { report, fire, drag } = setup();
    drag('a1');
    fire('pointermove', 15);
    fire('pointermove', 35, false);
    fire('pointerup', 15, false);
    expect(report.mock.calls).toEqual([[{ from: 'a1', to: 'b1' }]]);
  });
});

describe('hovers', () => {
  it('is a mouse, not a finger or pen', () => {
    expect(hovers('mouse')).toBe(true);
    expect(hovers('touch')).toBe(false);
    expect(hovers('pen')).toBe(false);
  });
});

describe('hoversControl', () => {
  it('counts a mouse and a pen, not a finger', () => {
    expect(hoversControl('mouse')).toBe(true);
    expect(hoversControl('pen')).toBe(true);
    expect(hoversControl('touch')).toBe(false);
  });
});

describe('watchHoverAndTap', () => {
  function setupBoard() {
    const board = new EventTarget();
    const hover = jest.fn<(over: boolean) => void>();
    const tap = jest.fn<() => void>();
    const stop = watchHoverAndTap(board, hover, tap);
    const fire = (type: string, pointerType: string, isPrimary = true) =>
      board.dispatchEvent(Object.assign(new Event(type), { pointerType, isPrimary }));
    return { hover, tap, stop, fire };
  }

  it('reports a mouse coming onto the board and leaving it, and no taps for its clicks', () => {
    const { hover, tap, fire } = setupBoard();
    fire('pointerenter', 'mouse');
    fire('pointerup', 'mouse');
    fire('pointerleave', 'mouse');
    expect(hover.mock.calls).toEqual([[true], [false]]);
    expect(tap).not.toHaveBeenCalled();
  });

  it('reports a finger or pen lifting as a tap, and never as hovering', () => {
    const { hover, tap, fire } = setupBoard();
    for (const pointerType of ['touch', 'pen']) {
      fire('pointerenter', pointerType);
      fire('pointerup', pointerType);
      fire('pointerleave', pointerType);
    }
    // A second finger taps nothing.
    fire('pointerup', 'touch', false);
    expect(tap).toHaveBeenCalledTimes(2);
    expect(hover).not.toHaveBeenCalled();
  });

  it('reports nothing once stopped', () => {
    const { hover, tap, stop, fire } = setupBoard();
    stop();
    fire('pointerenter', 'mouse');
    fire('pointerup', 'touch');
    expect(hover).not.toHaveBeenCalled();
    expect(tap).not.toHaveBeenCalled();
  });
});
