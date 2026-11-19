import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { restarts } from './restarts';

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('restarts', () => {
  it('waits longer after each failure in a row, up to 30 s', () => {
    const setRunning = jest.fn();
    const supervisor = restarts(setRunning);
    const pauses = [1000, 2000, 4000, 8000, 16_000, 30_000, 30_000];
    for (const pause of pauses) {
      supervisor.failed();
      expect(setRunning).toHaveBeenLastCalledWith(false); // The failed engine stops at once,
      jest.advanceTimersByTime(pause - 1);
      expect(setRunning).toHaveBeenLastCalledWith(false);
      jest.advanceTimersByTime(1);
      expect(setRunning).toHaveBeenLastCalledWith(true); // and the next starts after the pause.
    }
  });

  it('starts the pause over once an engine is ready', () => {
    const setRunning = jest.fn();
    const supervisor = restarts(setRunning);
    supervisor.failed();
    jest.advanceTimersByTime(1000);
    supervisor.failed();
    jest.advanceTimersByTime(2000);
    supervisor.ready();
    supervisor.failed();
    jest.advanceTimersByTime(1000);
    expect(setRunning.mock.calls.filter(([running]) => running)).toHaveLength(3);
  });

  it('restarts once for failures while a restart waits, and not at all once cancelled', () => {
    const setRunning = jest.fn();
    const supervisor = restarts(setRunning);
    supervisor.failed();
    supervisor.failed();
    jest.advanceTimersByTime(60_000);
    expect(setRunning.mock.calls).toEqual([[false], [true]]);

    setRunning.mockClear();
    supervisor.failed();
    supervisor.cancel();
    jest.advanceTimersByTime(60_000);
    expect(setRunning.mock.calls).toEqual([[false]]);
  });
});
