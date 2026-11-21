import { afterEach, expect, it, jest } from '@jest/globals';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'test-renderer';

import { Toggle } from './Toggle';

jest.mock('@/theme/narrow.css', () => ({}));
jest.mock('@/theme/touch.css', () => ({}));
// The native project doesn't transform Silk's ES modules: each part stands in
// as a host element named for it, carrying the props Toggle gives it.
jest.mock('@reactive/silk-native', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  const part =
    (name: string) =>
    ({ children, ...props }: { children?: ReactNode }) =>
      createElement(name, props, children);
  return {
    Field: {
      Root: part('FieldRoot'),
      Label: part('FieldLabel'),
      Description: part('FieldDescription'),
    },
    Switch: part('Switch'),
    Tooltip: {
      Root: part('TooltipRoot'),
      Trigger: part('TooltipTrigger'),
      Content: part('TooltipContent'),
    },
    useTheme: () => ({ theme: { semantic: { color: {} } } }),
  };
});

let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
});

function labelOf(disabled?: string) {
  root = createRoot();
  act(() => root!.render(<Toggle label="Moves" checked onChange={() => {}} disabled={disabled} />));
  return root.container.queryAll((node) => node.type === 'FieldLabel')[0].props;
}

it('leaves a disabled label no press of its own, so a tap on it opens the tooltip', () => {
  // A pressable Text would take the touch natively before the tooltip's trigger.
  expect(labelOf('Only in Explore').disabled).toBe(true);
  act(() => root?.unmount());
  expect(labelOf().disabled).toBe(false);
});
