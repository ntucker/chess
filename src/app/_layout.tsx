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
import { type ErrorBoundaryProps, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Suspense } from 'react';

import { ScreenFailure } from '@/components/NewVersion';
import { ProgressSync } from '@/resources/progress';
import { SettingsProvider } from '@/settings/SettingsProvider';
import { StockfishWhileNeeded } from '@/stockfish/demand';
import { StockfishHost } from '@/stockfish/StockfishHost';
import { themes } from '@/theme/theme';
import { useColorScheme } from '@/theme/useColorScheme';

const managers = () => [new ProgressSync(), ...getDefaultManagers()];

export default function RootLayout() {
  const colorScheme = useColorScheme();
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
            <Stack screenOptions={{ headerShown: false }} />
          </StockfishWhileNeeded>
        </SilkProvider>
      </SettingsProvider>
    </DataProvider>
  );
}

/**
 * Any screen that fails, in place of the whole app (Expo Router's boundary).
 * A screen's file goes missing when the site deploys a newer build than an
 * open page's, and the page then offers a reload; other errors go on up.
 */
export function ErrorBoundary({ error }: ErrorBoundaryProps) {
  const colorScheme = useColorScheme();
  return (
    <SilkProvider theme={themes[colorScheme]}>
      <Suspense fallback={null}>
        <ScreenFailure error={error} />
      </Suspense>
    </SilkProvider>
  );
}
