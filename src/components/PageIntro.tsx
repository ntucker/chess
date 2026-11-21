import { Stack, Text } from '@reactive/silk-native';
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';

import { Eyebrow } from '@/components/Eyebrow';
import { fonts } from '@/theme/theme';

/** The top of a page of text: an eyebrow, the title in the display serif, and a line under it. */
export function PageIntro({
  eyebrow,
  title,
  children,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <Stack gap="2">
      <Eyebrow>{eyebrow}</Eyebrow>
      <Text role="headingXl" accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      <Text role="body" tone="secondary">
        {children}
      </Text>
    </Stack>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.display },
});

/**
 * The column a page of text sits in, under the header: one program page, wide enough for a long line
 * beside a name (the Openings list). Each page sets its own `gap`.
 */
export const textColumn = {
  width: '100%',
  maxWidth: 760,
  paddingTop: 12,
  paddingBottom: 48,
} as const;
