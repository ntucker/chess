// localStorage on Android, where the app remembers its settings and progress
// (src/context/storage.ts). The web has its own.
import 'expo-sqlite/localStorage/install';

import { DataProvider, getDefaultManagers } from '@data-client/react';
import { DMMono_400Regular } from '@expo-google-fonts/dm-mono';
import {
  DMSerifDisplay_400Regular,
  DMSerifDisplay_400Regular_Italic,
} from '@expo-google-fonts/dm-serif-display';
import { InstrumentSans_400Regular } from '@expo-google-fonts/instrument-sans';
import { SilkProvider } from '@reactive/silk-native';
import { useFonts } from 'expo-font';
import { type ErrorBoundaryProps, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { useNavigationTransitions } from '@/components/navigation';
import { ScreenFailure } from '@/components/NewVersion';
import { ProgressSync } from '@/resources/progress';
import { SettingsProvider } from '@/settings/SettingsProvider';
import { StockfishWhileNeeded } from '@/stockfish/demand';
import { StockfishHost } from '@/stockfish/StockfishHost';
import { navigationThemes } from '@/theme/navigationTheme';
import { themes } from '@/theme/theme';
import { useColorScheme } from '@/theme/useColorScheme';

const managers = () => [new ProgressSync(), ...getDefaultManagers()];

export default function RootLayout() {
  const colorScheme = useColorScheme();
  useNavigationTransitions();
  const [fontsLoaded] = useFonts({
    DMSerifDisplay_400Regular,
    DMSerifDisplay_400Regular_Italic,
    InstrumentSans_400Regular,
    DMMono_400Regular,
  });
  // Native waits under the splash screen; the web page is rendered on the
  // server and shows fallback fonts until these arrive.
  if (!fontsLoaded && process.env.EXPO_OS !== 'web') return null;

  return (
    <DataProvider managers={managers}>
      <SettingsProvider>
        <SilkProvider theme={themes[colorScheme]}>
          <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
          <StockfishWhileNeeded host={<StockfishHost />}>
            {/* Every screen ships in the app's first file (app.json turns off
                Expo Router's asyncRoutes): a screen whose file loads on its
                first visit opens empty for a moment, even in a transition,
                since its Suspense boundary is new. */}
            <ThemeProvider value={navigationThemes[colorScheme]}>
              <Stack screenOptions={{ headerShown: false }} />
            </ThemeProvider>
          </StockfishWhileNeeded>
        </SilkProvider>
      </SettingsProvider>
    </DataProvider>
  );
}

/**
 * Any screen that fails, in place of the whole app (Expo Router's boundary),
 * with a reload when a file the screen loads late is gone because the site
 * deployed a newer build. It replaces RootLayout, providers and all, so it
 * themes itself. (The Stack's screen boundary would keep the providers but
 * skips layouts.)
 */
export function ErrorBoundary({ error }: ErrorBoundaryProps) {
  const colorScheme = useColorScheme();
  return (
    <SilkProvider theme={themes[colorScheme]}>
      <ScreenFailure error={error} />
    </SilkProvider>
  );
}
