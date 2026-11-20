import { useIsFocused } from 'expo-router';
import { useEffect, useEffectEvent } from 'react';

/**
 * On the web, `onKey` hears every key pressed while this screen is in front:
 * a screen left underneath stays mounted, so it must stop listening. Keys
 * pressed in a dialog over it (`Sheet`, which traps focus) are the dialog's.
 */
export function useScreenKeys(onKey: (event: KeyboardEvent) => void) {
  const focused = useIsFocused();
  const handle = useEffectEvent(onKey);
  useEffect(() => {
    if (process.env.EXPO_OS !== 'web' || !focused) return;
    const listener = (event: KeyboardEvent) => {
      if (event.target instanceof Element && event.target.closest('[aria-modal="true"]')) return;
      handle(event);
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [focused]);
}
