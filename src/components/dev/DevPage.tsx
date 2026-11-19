import { Stack, Surface, Text, useTheme } from '@reactive/silk-native';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Eyebrow } from '@/components/Eyebrow';
import { fonts, spotlight } from '@/theme/theme';

/** The frame of a developer page: the app's background, a heading and a short intro above `children`. */
export function DevPage({
  title,
  intro,
  children,
}: {
  readonly title: string;
  readonly intro: string;
  readonly children: ReactNode;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={[
        devStyles.fill,
        {
          backgroundColor: theme.semantic.color.surface,
          backgroundImage: spotlight[theme.colorScheme],
        },
      ]}
    >
      <SafeAreaView style={devStyles.fill}>
        <ScrollView contentContainerStyle={styles.page}>
          <Stack gap="6" style={styles.column}>
            <Stack gap="2">
              <Eyebrow>For developers</Eyebrow>
              <Text role="headingLg" accessibilityRole="header">
                {title}
              </Text>
              <Text role="bodySm" tone="secondary">
                {intro}
              </Text>
            </Stack>
            {children}
          </Stack>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

/** A square, raised frame for a board in a developer page's card. */
export function FramedBoard({ children }: { readonly children: ReactNode }) {
  const { theme } = useTheme();
  return (
    <Surface elevation="overlay" radius="md" border="subtle" style={styles.frame}>
      <View
        style={[devStyles.fill, { borderRadius: theme.semantic.radius.md - 1, overflow: 'hidden' }]}
      >
        {children}
      </View>
    </Surface>
  );
}

/** Layout shared by developer pages: a wrapping grid of cards. */
export const devStyles = StyleSheet.create({
  fill: { flex: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 32 },
  card: { flexGrow: 1, flexShrink: 1, flexBasis: 280, maxWidth: 340 },
  mono: { fontFamily: fonts.mono },
});

const styles = StyleSheet.create({
  page: { padding: 20, alignItems: 'center' },
  column: { width: '100%', maxWidth: 1100 },
  frame: { width: '100%', aspectRatio: 1 },
});
