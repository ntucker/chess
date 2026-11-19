import { describe, expect, it, jest } from '@jest/globals';

import { type Drag, hovers, watchDrag } from './pointer';

/** Squares 10 pixels wide along one rank: x 0-9 is a1, 10-19 is b1, and so on; nothing past h1. */
const squareAt = (x: number) => (x >= 0 && x < 80 ? `${'abcdefgh'[Math.floor(x / 10)]}1` : undefined);

function setup() {
  const page = new EventTarget();
  let dragging: string | undefined;
  const report = jest.fn<(drag: Drag<string> | null) => void>();
  const stop = watchDrag(page, () => dragging, squareAt, report);
  const fire = (type: string, clientX = 0, isPrimary = true) =>
    page.dispatchEvent(Object.assign(new Event(type), { clientX, clientY: 0, isPrimary }));
  const drag = (from: string | undefined) => {
    dragging = from;
  };
  return { report, stop, fire, drag };
}

describe('watchDrag', () => {
  it('reports each new square a dragged piece is over once, and null when it drops', () => {
    const { report, fire, drag } = setup();
    drag('a1');
    fire('pointermove', 5);
    fire('pointermove', 15);
    fire('pointermove', 17);
    fire('pointermove', 25);
    fire('pointerup', 25);
    expect(report.mock.calls).toEqual([
      [{ from: 'a1', to: 'b1' }],
      [{ from: 'a1', to: 'c1' }],
      [null],
    ]);
  });

  it('reports null back over its own square, or off the board', () => {
    const { report, fire, drag } = setup();
    drag('a1');
    fire('pointermove', 15);
    fire('pointermove', 5);
    fire('pointermove', 15);
    fire('pointermove', 95);
    expect(report.mock.calls).toEqual([
      [{ from: 'a1', to: 'b1' }],
      [null],
      [{ from: 'a1', to: 'b1' }],
      [null],
    ]);
  });

  it('reports nothing while no piece is dragged, a mouse passing over included', () => {
    const { report, fire } = setup();
    fire('pointermove', 15);
    fire('pointerup', 15);
    expect(report).not.toHaveBeenCalled();
  });

  it('ends a drag when the pointer is cancelled, or when stopped', () => {
    const { report, stop, fire, drag } = setup();
    drag('a1');
    fire('pointermove', 15);
    drag(undefined);
    fire('pointercancel');
    drag('a1');
    fire('pointermove', 25);
    stop();
    fire('pointermove', 35);
    expect(report.mock.calls).toEqual([
      [{ from: 'a1', to: 'b1' }],
      [null],
      [{ from: 'a1', to: 'c1' }],
      [null],
    ]);
  });

  it('keeps the drag when a second finger lifts', () => {
    const { report, fire, drag } = setup();
    drag('a1');
    fire('pointermove', 15);
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
