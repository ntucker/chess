// Renders Silk, which ships ES modules: the web project's transformIgnorePatterns
// (package.json) lets @reactive through Babel for it.
import { describe, expect, it, jest } from '@jest/globals';
import { SilkProvider } from '@reactive/silk-native';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { themes } from '@/theme/theme';

import { Sheet } from './Sheet';
import { useScreenKeys } from './useScreenKeys';

// Its font needs Expo's asset registry, which the web preset doesn't resolve.
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('expo-router', () => ({ useIsFocused: () => true }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Listener({ onKey, sheet }: { onKey: (key: string) => void; sheet: boolean }) {
  useScreenKeys((event) => onKey(event.key));
  return sheet ? (
    <Sheet title="Settings" onClose={() => {}}>
      {null}
    </Sheet>
  ) : null;
}

/** The keys the screen hears when `key` is pressed on `target` (the page, or inside the open sheet). */
function heard(key: string, target: 'page' | 'sheet', taken = false) {
  const onKey = jest.fn<(key: string) => void>();
  const host = document.body.appendChild(document.createElement('div'));
  const root = createRoot(host);
  act(() =>
    root.render(
      <SilkProvider theme={themes.dark}>
        <Listener onKey={onKey} sheet={target === 'sheet'} />
      </SilkProvider>,
    ),
  );
  // Inside the sheet, which React Native Web's Modal marks as an aria-modal dialog.
  const on =
    target === 'sheet'
      ? document.querySelector('[aria-modal="true"]')!.firstElementChild!
      : document.body;
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  // Another control took it first.
  if (taken) event.preventDefault();
  on.dispatchEvent(event);
  act(() => root.unmount());
  host.remove();
  return onKey.mock.calls.map(([found]) => found);
}

describe('useScreenKeys', () => {
  it('hears keys pressed on the page', () => {
    expect(heard('ArrowLeft', 'page')).toEqual(['ArrowLeft']);
  });

  it('leaves a key another control took (prevented its default) to that control', () => {
    expect(heard('Escape', 'page', true)).toEqual([]);
  });

  it('leaves keys pressed in the settings sheet to the sheet', () => {
    expect(heard('Escape', 'sheet')).toEqual([]);
    expect(heard('ArrowLeft', 'sheet')).toEqual([]);
  });
});
