import type { ColorScheme } from '@reactive/silk-core';
import { useSyncExternalStore } from 'react';
import { Appearance } from 'react-native';

const subscribe = (onChange: () => void) => {
  const subscription = Appearance.addChangeListener(onChange);
  return () => subscription.remove();
};
const getScheme = (): ColorScheme => (Appearance.getColorScheme() === 'dark' ? 'dark' : 'light');

/**
 * The device's light or dark setting. The web build renders pages on the
 * server, which can't know it, so the first render there is always light and
 * the setting applies once the page hydrates. (React Native's useColorScheme
 * reads it during hydration, so the server's light styles stay where it said
 * dark.)
 */
export function useColorScheme(): ColorScheme {
  return useSyncExternalStore(subscribe, getScheme, () => 'light');
}
