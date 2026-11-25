import { useIsFocused } from 'expo-router';
import { useEffect, useEffectEvent } from 'react';

/**
 * On the web, `onKey` hears every key pressed while this screen is in front:
 * a screen left underneath stays mounted, so it must stop listening. Keys
 * pressed in a dialog over it (`Sheet`, which traps focus) are the dialog's,
 * and a key another control took first (preventing its default, as Silk's
 * Popover does with Escape and its Listbox with the arrows) is that control's.
 * With no `onKey`, it doesn't listen.
 */
export function useScreenKeys(onKey: ((event: KeyboardEvent) => void) | undefined) {
  const focused = useIsFocused();
  const listening = onKey !== undefined;
  const handle = useEffectEvent((event: KeyboardEvent) => onKey?.(event));
  useEffect(() => {
    if (process.env.EXPO_OS !== 'web' || !focused || !listening) return;
    const listener = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.target instanceof Element && event.target.closest('[aria-modal="true"]')) return;
      handle(event);
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [focused, listening]);
}
