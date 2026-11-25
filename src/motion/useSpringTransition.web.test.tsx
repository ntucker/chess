import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'test-renderer';

import { springMotion, springs } from './spring';
import { useSpringTransition } from './useSpringTransition';

let mockReducedMotion = false;
jest.mock('@reactive/silk-native', () => ({ useReducedMotion: () => mockReducedMotion }));

let root: Root | undefined;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  mockReducedMotion = false;
});

/** The transition's timing on the snappy spring. */
function timing() {
  let shown: ReturnType<typeof useSpringTransition> | undefined;
  function Probe() {
    shown = useSpringTransition(springs.snappy);
    return null;
  }
  root = createRoot();
  act(() => root!.render(<Probe />));
  return shown!;
}

it('plays for as long as the spring takes to settle', () => {
  expect(timing().transitionDuration).toBe(springMotion(springs.snappy).durationMs);
});

it('is instant when the device asks for reduced motion', () => {
  mockReducedMotion = true;
  expect(timing().transitionDuration).toBe(0);
});
