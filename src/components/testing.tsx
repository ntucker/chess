// Helpers for tests on the real router. Metro bundles only what the app
// imports, so this never ships.
import { Stack, useGlobalSearchParams, usePathname } from 'expo-router';
import { useLayoutEffect } from 'react';

/** What the root stack shows, as of its last render: its path and search params. */
export const shown: { path?: string; params: Partial<Record<string, string | string[]>> } = {
  params: {},
};

/** The app's root stack, noting what it shows in `shown`. */
export function RootStack() {
  const path = usePathname();
  const params = useGlobalSearchParams();
  useLayoutEffect(() => {
    shown.path = path;
    shown.params = params;
  });
  return <Stack screenOptions={{ headerShown: false }} />;
}
