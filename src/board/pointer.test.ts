import { describe, expect, it, jest } from '@jest/globals';

import {
  type BoardPointer,
  type Drag,
  hovers,
  hoversControl,
  watchBoardPointer,
  watchDrag,
} from './pointer';

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

describe('watchBoardPointer', () => {
  function setupBoard() {
    const board = new EventTarget();
    const report = jest.fn<(pointer: BoardPointer) => void>();
    let listening = true;
    const stop = watchBoardPointer(board, () => listening, report);
    const listen = (on: boolean) => {
      listening = on;
    };
    const fire = (type: string, pointerType: string, clientX = 0, isPrimary = true) =>
      board.dispatchEvent(
        Object.assign(new Event(type), { pointerType, isPrimary, clientX, clientY: 0 }),
      );
    const tap = (pointerType: string, from = 0, to = from) => {
      fire('pointerdown', pointerType, from);
      fire('pointerup', pointerType, to);
    };
    return { report, stop, fire, tap, listen };
  }

  it('reports a mouse coming onto the board and leaving it, and no taps for its clicks', () => {
    const { report, fire, tap } = setupBoard();
    fire('pointerenter', 'mouse');
    tap('mouse');
    fire('pointerleave', 'mouse');
    expect(report.mock.calls).toEqual([['enter'], ['leave']]);
  });

  it('reports a finger or pen pressing and lifting in place as a tap, and never as hovering', () => {
    const { report, fire, tap } = setupBoard();
    for (const pointerType of ['touch', 'pen']) {
      fire('pointerenter', pointerType);
      tap(pointerType, 40, 48);
      fire('pointerleave', pointerType);
    }
    expect(report.mock.calls).toEqual([['tap'], ['tap']]);
  });

  it('takes no swipe, second finger, cancelled press or lift without a press for a tap', () => {
    const { report, fire, tap } = setupBoard();
    tap('touch', 0, 60);
    // Out and back again.
    fire('pointerdown', 'touch', 0);
    fire('pointermove', 'touch', 60);
    fire('pointerup', 'touch', 2);
    // A second finger joins the first, which cancels its press, so its lift is no tap.
    fire('pointerdown', 'touch', 0);
    fire('pointerdown', 'touch', 0, false);
    fire('pointerup', 'touch', 0);
    fire('pointerdown', 'touch');
    fire('pointercancel', 'touch');
    fire('pointerup', 'touch');
    // A lift with no press on the board, as when one started off it.
    fire('pointerup', 'touch');
    expect(report).not.toHaveBeenCalled();
  });

  it('reports nothing while not listening, and no tap from a press made before it listened', () => {
    const { report, fire, tap, listen } = setupBoard();
    listen(false);
    fire('pointerenter', 'mouse');
    tap('touch');
    // The press plays the mating move, and the board listens before the finger lifts.
    fire('pointerdown', 'touch');
    listen(true);
    fire('pointerup', 'touch');
    expect(report).not.toHaveBeenCalled();
    tap('touch');
    expect(report.mock.calls).toEqual([['tap']]);
  });

  it('reports nothing once stopped', () => {
    const { report, stop, fire, tap } = setupBoard();
    stop();
    fire('pointerenter', 'mouse');
    tap('touch');
    expect(report).not.toHaveBeenCalled();
  });
});
