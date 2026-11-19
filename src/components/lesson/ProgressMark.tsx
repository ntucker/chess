import Ionicons from '@expo/vector-icons/Ionicons';
import { Text, useTheme } from '@reactive/silk-native';
import { StyleSheet, View } from 'react-native';

import type { Mark } from '@/progress/progress';

/** Each mark's name in the key above the list. */
const MARK_NAMES: Readonly<Record<Mark, string>> = {
  seen: 'Seen',
  passed: 'Passed in Practice',
};

/** Each mark as a row's label says it, after the move. */
export const SPOKEN_MARKS: Readonly<Record<Mark, string>> = {
  seen: 'seen',
  passed: 'passed in Practice',
};

/** The mark's size, a little under the move notation's capitals. */
export const MARK_SIZE = 15;

/**
 * A candidate row's progress mark: an eye in quiet ink once Explore has shown
 * the move's position, and a check on a disc in the theme's accent once
 * Practice has passed every line through it. Drawn only: the row's label
 * says the same in words.
 */
export function ProgressMark({ mark }: { readonly mark: Mark }) {
  const { color } = useTheme().theme.semantic;
  return mark === 'seen' ? (
    <Ionicons name="eye-outline" size={MARK_SIZE} color={color.textSecondary} aria-hidden />
  ) : (
    <Ionicons
      name="checkmark-circle"
      size={MARK_SIZE}
      color={color.tones.accent.solid}
      aria-hidden
    />
  );
}

/** A key to the `marks` a list shows, each beside its name; nothing when it shows none. */
export function MarkLegend({ marks }: { readonly marks: ReadonlySet<Mark> }) {
  const kinds = (['seen', 'passed'] as const).filter((mark) => marks.has(mark));
  if (!kinds.length) return null;
  return (
    <View style={styles.legend}>
      {kinds.map((mark) => (
        <View key={mark} style={styles.item}>
          <ProgressMark mark={mark} />
          <Text role="caption" tone="secondary">
            {MARK_NAMES[mark]}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
