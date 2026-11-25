import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, Surface, Text, useTheme } from '@reactive/silk-native';
import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Notation } from '@/components/Notation';

interface Props {
  /** The tone that inks the card's border, background and heading icon. */
  readonly tone: 'danger' | 'success' | 'accent';
  /** The heading, an icon and a line of notation; a card without one starts with its body. */
  readonly heading?: {
    readonly icon: ComponentProps<typeof Ionicons>['name'];
    readonly title: string;
  };
  readonly children: ReactNode;
}

/**
 * The card a lesson's news sits in above the moves: a trap fallen into, a
 * cue's acts, a cue's answer. A tinted surface with an optional heading.
 */
export function ToneCard({ tone, heading, children }: Props) {
  const ink = useTheme().theme.semantic.color.tones[tone];
  return (
    <Surface
      radius="md"
      border="subtle"
      style={[styles.card, { borderColor: ink.border, backgroundColor: ink.subtle }]}
    >
      <Stack gap="3">
        {heading ? (
          <View style={styles.heading}>
            <Ionicons name={heading.icon} size={18} color={ink.text} />
            <Text role="headingSm" style={styles.title}>
              <Notation>{heading.title}</Notation>
            </Text>
          </View>
        ) : null}
        {children}
      </Stack>
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { flexShrink: 1 },
});
