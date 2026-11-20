import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'test-renderer';

import { LONG_WAIT_MS, useLongWait } from './useLongWait';

let root: Root | undefined;
const answers: boolean[] = [];
const latest = () => answers[answers.length - 1];

function Wait({ pending }: { readonly pending: boolean }) {
  answers.push(useLongWait(pending));
  return null;
}

const show = (pending: boolean) =>
  act(() => {
    root ??= createRoot();
    root.render(<Wait pending={pending} />);
  });
const wait = (ms: number) => act(() => jest.advanceTimersByTime(ms));

beforeEach(() => {
  jest.useFakeTimers();
  answers.length = 0;
});
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  jest.useRealTimers();
});

describe('useLongWait', () => {
  it('shows a wait only once it has lasted', () => {
    show(true);
    expect(latest()).toBe(false);
    wait(LONG_WAIT_MS - 1);
    expect(latest()).toBe(false);
    wait(1);
    expect(latest()).toBe(true);
    show(false);
    expect(latest()).toBe(false);
  });

  it('starts counting again for the next wait', () => {
    show(true);
    wait(LONG_WAIT_MS);
    show(false);
    show(true);
    expect(latest()).toBe(false);
    wait(LONG_WAIT_MS - 1);
    expect(latest()).toBe(false);
  });

  it('never shows a wait that ends in time', () => {
    show(true);
    wait(LONG_WAIT_MS / 2);
    show(false);
    wait(LONG_WAIT_MS);
    expect(answers).not.toContain(true);
  });
});
