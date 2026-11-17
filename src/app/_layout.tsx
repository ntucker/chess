import { DataProvider } from '@data-client/react';
import { SilkProvider } from '@reactive/silk-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { useColorScheme } from '@/theme/useColorScheme';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <DataProvider>
      <SilkProvider colorScheme={colorScheme}>
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
        <Stack screenOptions={{ headerShown: false }} />
      </SilkProvider>
    </DataProvider>
  );
}
