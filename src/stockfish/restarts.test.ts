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
    const run = jest.fn();
    const supervisor = restarts(run);
    const pauses = [1000, 2000, 4000, 8000, 16_000, 30_000, 30_000];
    for (const pause of pauses) {
      supervisor.failed();
      expect(run).toHaveBeenLastCalledWith(false); // The failed engine stops at once,
      jest.advanceTimersByTime(pause - 1);
      expect(run).toHaveBeenLastCalledWith(false);
      jest.advanceTimersByTime(1);
      expect(run).toHaveBeenLastCalledWith(true); // and the next starts after the pause.
    }
  });

  it('starts the pause over once an engine is ready', () => {
    const run = jest.fn();
    const supervisor = restarts(run);
    supervisor.failed();
    jest.advanceTimersByTime(1000);
    supervisor.failed();
    jest.advanceTimersByTime(2000);
    supervisor.ready();
    supervisor.failed();
    jest.advanceTimersByTime(1000);
    expect(run.mock.calls.filter(([running]) => running)).toHaveLength(3);
  });

  it('restarts once for failures while a restart waits, and not at all once cancelled', () => {
    const run = jest.fn();
    const supervisor = restarts(run);
    supervisor.failed();
    supervisor.failed();
    jest.advanceTimersByTime(60_000);
    expect(run.mock.calls).toEqual([[false], [true]]);

    run.mockClear();
    supervisor.failed();
    supervisor.cancel();
    jest.advanceTimersByTime(60_000);
    expect(run.mock.calls).toEqual([[false]]);
  });
});
