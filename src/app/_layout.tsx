// localStorage on Android, where the app remembers its settings, progress and accounts
// (src/context/storage.ts). The web has its own.
import 'expo-sqlite/localStorage/install';

import { DataProvider, getDefaultManagers } from '@data-client/react';
import { useFonts } from 'expo-font';
import { type ErrorBoundaryProps, Stack } from 'expo-router';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ScreenFailure } from '@/components/NewVersion';
import { AccountsSync, LichessRefusals } from '@/resources/accounts';
import { AnalysisManager } from '@/resources/analysis';
import { ProgressSync } from '@/resources/progress';
import { SettingsProvider } from '@/settings/SettingsProvider';
import { StockfishWhileNeeded } from '@/stockfish/demand';
import { FullStockfishHost } from '@/stockfish/FullStockfishHost';
import { StockfishHost } from '@/stockfish/StockfishHost';
import { AppTheme } from '@/theme/AppTheme';
import { FONT_FILES } from '@/theme/fontFiles';

const managers = () => [
  new ProgressSync(),
  new AccountsSync(),
  new LichessRefusals(),
  new AnalysisManager(),
  ...getDefaultManagers(),
];

export default function RootLayout() {
  const [fontsLoaded] = useFonts(FONT_FILES);
  // Native waits under the splash screen; the web page is rendered on the
  // server and shows fallback fonts until these arrive.
  if (!fontsLoaded && process.env.EXPO_OS !== 'web') return null;

  return (
    // Gesture handler's gestures (the review's graph) work only inside it.
    <GestureHandlerRootView style={styles.root}>
      <DataProvider managers={managers}>
        <SettingsProvider>
          <AppTheme>
            <StockfishWhileNeeded host={<StockfishHost />} fullHost={<FullStockfishHost />}>
              {/* Every screen ships in the app's first file (app.json turns off
                  Expo Router's asyncRoutes): a screen whose file loads on its
                  first visit opens empty for a moment, even in a transition,
                  since its Suspense boundary is new. */}
              <Stack screenOptions={{ headerShown: false }} />
            </StockfishWhileNeeded>
          </AppTheme>
        </SettingsProvider>
      </DataProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Any screen that fails, in place of the whole app (Expo Router's boundary),
 * with a reload when a file the screen loads late is gone because the site
 * deployed a newer build. It replaces RootLayout, providers and all, so it
 * themes itself, with its own SettingsProvider for the learner's theme.
 * (The Stack's screen boundary would keep the providers but skips layouts.)
 */
export function ErrorBoundary({ error }: ErrorBoundaryProps) {
  return (
    <SettingsProvider>
      <AppTheme>
        <ScreenFailure error={error} />
      </AppTheme>
    </SettingsProvider>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
