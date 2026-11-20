// Renders Silk, which ships ES modules: the web project's transformIgnorePatterns
// (package.json) lets @reactive through Babel for it.
import { describe, expect, it, jest } from '@jest/globals';
import { SilkProvider } from '@reactive/silk-native';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { themes } from '@/theme/theme';

import { Sheet } from './Sheet';

// Its font needs Expo's asset registry, which the web preset doesn't resolve.
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
// Stands in for the navigator: whether the sheet's screen is in front.
let mockFocused = true;
jest.mock('expo-router', () => ({ useIsFocused: () => mockFocused }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('Sheet', () => {
  it('closes once another screen comes on top of its own', () => {
    const onClose = jest.fn();
    const root = createRoot(document.createElement('div'));
    const render = () =>
      act(() =>
        root.render(
          <SilkProvider theme={themes.dark}>
            <Sheet title="Settings" onClose={onClose}>
              {null}
            </Sheet>
          </SilkProvider>,
        ),
      );
    mockFocused = true;
    render();
    expect(onClose).not.toHaveBeenCalled();
    mockFocused = false;
    render();
    expect(onClose).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });
});
