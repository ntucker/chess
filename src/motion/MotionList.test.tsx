import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'test-renderer';

// Records the props each item's Animated.View renders with, and each mount, by testID.
const mockViews: { testID?: string; layout?: unknown; entering?: unknown }[] = [];
const mockMounts: (string | undefined)[] = [];
let mockReduced = false;
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: {
    View: (props: { testID?: string; layout?: unknown; entering?: unknown }) => {
      const { useEffect } = jest.requireActual<typeof import('react')>('react');
      useEffect(() => {
        mockMounts.push(props.testID);
      }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once per mount
      mockViews.push(props);
      return null;
    },
  },
  defineAnimation: () => 0,
  useSharedValue: (value: unknown) => ({ value }),
}));
jest.mock('@reactive/silk-native', () => ({ useReducedMotion: () => mockReduced }));

// eslint-disable-next-line import/first -- after the mocks they replace
import { MotionList, MotionView } from './MotionList';

let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  mockViews.length = 0;
  mockMounts.length = 0;
  mockReduced = false;
});

function show(ids: string[], dependency: unknown) {
  mockViews.length = 0;
  act(() => {
    root ??= createRoot();
    root.render(
      <MotionList layoutDependency={dependency}>
        {ids.map((id) => (
          <MotionView key={id} id={id} testID={id} />
        ))}
      </MotionList>,
    );
  });
  return new Map(mockViews.map((props) => [props.testID, props]));
}

describe('MotionList on Android', () => {
  it('fades in only the items that arrive with its dependency', () => {
    expect(show(['a'], 1).get('a')?.entering).toBeUndefined();
    const changed = show(['a', 'b'], 2);
    expect(changed.get('b')?.entering).toBeDefined();
    expect(changed.get('a')?.layout).toBeDefined();
    const steady = show(['a', 'b', 'c'], 2);
    expect(steady.get('c')?.entering).toBeUndefined();
    // still glides when it moves without the dependency changing
    expect(steady.get('a')?.layout).toBeDefined();
  });

  it('animates nothing while motion is reduced', () => {
    mockReduced = true;
    show(['a'], 1);
    const changed = show(['a', 'b'], 2);
    expect(changed.get('a')?.layout).toBeUndefined();
    expect(changed.get('b')?.entering).toBeUndefined();
  });

  it('keeps its items mounted when reduced motion turns on', () => {
    show(['a'], 1);
    mockReduced = true;
    expect(show(['a'], 1).get('a')?.layout).toBeUndefined();
    expect(mockMounts).toEqual(['a']);
  });
});
