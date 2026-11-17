import { DataProvider } from '@data-client/react';
import { DMMono_400Regular } from '@expo-google-fonts/dm-mono';
import {
  DMSerifDisplay_400Regular,
  DMSerifDisplay_400Regular_Italic,
} from '@expo-google-fonts/dm-serif-display';
import { InstrumentSans_400Regular } from '@expo-google-fonts/instrument-sans';
import { SilkProvider } from '@reactive/silk-native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { themes } from '@/theme/theme';
import { useColorScheme } from '@/theme/useColorScheme';

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
    <DataProvider>
      <SilkProvider theme={themes[colorScheme]}>
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
        <Stack screenOptions={{ headerShown: false }} />
      </SilkProvider>
    </DataProvider>
  );
}
