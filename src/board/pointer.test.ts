import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { HOLD_MS, HOLD_SLOP, watchPointer } from './pointer';

/** Squares 10 pixels wide along one rank: x 0-9 is a1, 10-19 is b1, and so on; nothing past h1. */
const squareAt = (x: number) => (x >= 0 && x < 80 ? `${'abcdefgh'[Math.floor(x / 10)]}1` : undefined);

type Pointer = Partial<Pick<PointerEvent, 'pointerType' | 'buttons' | 'pointerId' | 'isPrimary' | 'clientY'>>;

function setup() {
  const board = new EventTarget();
  const page = new EventTarget();
  const hover = jest.fn<(square: string | null) => void>();
  const hold = jest.fn<(square: string | null) => void>();
  const stop = watchPointer(board, page, squareAt, { hover, hold });
  const fire = (target: EventTarget, type: string, clientX: number, pointer: Pointer = {}) =>
    target.dispatchEvent(
      Object.assign(new Event(type), {
        pointerType: 'mouse',
        buttons: 0,
        pointerId: 1,
        isPrimary: true,
        clientX,
        clientY: 0,
        ...pointer,
      }),
    );
  return { board, page, hover, hold, stop, fire };
}

describe('watchPointer: mouse', () => {
  it('reports each new square under the mouse once, and null when it leaves', () => {
    const { board, hover, fire } = setup();
    fire(board, 'pointermove', 5);
    fire(board, 'pointermove', 7);
    fire(board, 'pointermove', 15);
    fire(board, 'pointerleave', 15);
    expect(hover.mock.calls).toEqual([['a1'], ['b1'], [null]]);
  });

  it("doesn't change the hover while a button is down, then reports where it came up", () => {
    const { board, page, hover, fire } = setup();
    fire(board, 'pointermove', 5);
    fire(board, 'pointerdown', 5, { buttons: 1 });
    fire(board, 'pointermove', 25, { buttons: 1 });
    fire(board, 'pointerleave', 95, { buttons: 1 });
    fire(page, 'pointerup', 35);
    expect(hover.mock.calls).toEqual([['a1'], ['d1']]);
  });

  it('reports null when a drag ends off the board', () => {
    const { board, page, hover, fire } = setup();
    fire(board, 'pointermove', 5);
    fire(board, 'pointerdown', 5, { buttons: 1 });
    fire(page, 'pointerup', 200);
    expect(hover.mock.calls).toEqual([['a1'], [null]]);
  });

  it('ignores a drag that started off the board', () => {
    const { board, hover, fire } = setup();
    fire(board, 'pointermove', 5, { buttons: 1 });
    expect(hover).not.toHaveBeenCalled();
  });

  it('never reports a hold', () => {
    const { board, hold, fire } = setup();
    jest.useFakeTimers();
    fire(board, 'pointerdown', 5, { buttons: 1 });
    jest.advanceTimersByTime(HOLD_MS * 2);
    expect(hold).not.toHaveBeenCalled();
    jest.useRealTimers();
  });
});

describe('watchPointer: touch', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });
  const finger = { pointerType: 'touch' } as const;

  it('reports a hold after the finger rests, and null when it lifts', () => {
    const { board, page, hold, hover, fire } = setup();
    fire(board, 'pointerdown', 15, finger);
    jest.advanceTimersByTime(HOLD_MS - 1);
    expect(hold).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(hold.mock.calls).toEqual([['b1']]);
    fire(page, 'pointerup', 15, finger);
    expect(hold.mock.calls).toEqual([['b1'], [null]]);
    expect(hover).not.toHaveBeenCalled();
  });

  it('reports nothing for a tap', () => {
    const { board, page, hold, fire } = setup();
    fire(board, 'pointerdown', 15, finger);
    fire(page, 'pointerup', 15, finger);
    jest.advanceTimersByTime(HOLD_MS);
    expect(hold).not.toHaveBeenCalled();
  });

  it('reports nothing for a drag, but allows a little wobble', () => {
    const { board, page, hold, fire } = setup();
    fire(board, 'pointerdown', 15, finger);
    fire(board, 'pointermove', 15 + HOLD_SLOP, finger);
    jest.advanceTimersByTime(HOLD_MS);
    expect(hold.mock.calls).toEqual([['b1']]);
    fire(page, 'pointerup', 15, finger);

    hold.mockClear();
    fire(board, 'pointerdown', 15, finger);
    fire(board, 'pointermove', 16 + HOLD_SLOP, finger);
    jest.advanceTimersByTime(HOLD_MS);
    fire(page, 'pointerup', 30, finger);
    expect(hold).not.toHaveBeenCalled();
  });

  it('keeps holding when the finger moves after the hold, until it lifts or is cancelled', () => {
    const { board, page, hold, fire } = setup();
    fire(board, 'pointerdown', 15, finger);
    jest.advanceTimersByTime(HOLD_MS);
    fire(board, 'pointermove', 60, finger);
    fire(page, 'pointercancel', 60, finger);
    expect(hold.mock.calls).toEqual([['b1'], [null]]);
  });

  it('ignores a second finger', () => {
    const { board, page, hold, fire } = setup();
    fire(board, 'pointerdown', 15, finger);
    fire(board, 'pointerdown', 45, { ...finger, pointerId: 2, isPrimary: false });
    fire(page, 'pointerup', 45, { ...finger, pointerId: 2, isPrimary: false });
    jest.advanceTimersByTime(HOLD_MS);
    expect(hold.mock.calls).toEqual([['b1']]);
  });

  it('ends a hold and stops listening when stopped', () => {
    const { board, hold, stop, fire } = setup();
    fire(board, 'pointerdown', 15, finger);
    jest.advanceTimersByTime(HOLD_MS);
    stop();
    expect(hold.mock.calls).toEqual([['b1'], [null]]);
    fire(board, 'pointerdown', 15, finger);
    jest.advanceTimersByTime(HOLD_MS);
    expect(hold).toHaveBeenCalledTimes(2);
  });
});
