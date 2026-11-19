import { Text, useTheme } from '@reactive/silk-native';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import type { Mark } from '@/progress/progress';

/** What each mark says, for its legend and for screen readers. */
export const MARK_NAMES: Readonly<Record<Mark, string>> = {
  seen: 'Seen',
  passed: 'Passed in Practice',
};

/** The mark's size, a little under the move notation's capitals. */
export const MARK_SIZE = 14;

/**
 * A candidate row's progress mark: an eye in quiet ink once Explore has shown
 * the move's position, and a check on a disc in the theme's accent once
 * Practice has passed every line through it. Drawn only: the row's label
 * says the same in words.
 */
export function ProgressMark({ mark }: { readonly mark: Mark }) {
  const { theme } = useTheme();
  const { color } = theme.semantic;
  return (
    <Svg width={MARK_SIZE} height={MARK_SIZE} viewBox="0 0 16 16" aria-hidden>
      {mark === 'seen' ? (
        <>
          <Path
            d="M1.25 8C3.1 4.75 5.35 3.25 8 3.25s4.9 1.5 6.75 4.75C12.9 11.25 10.65 12.75 8 12.75S3.1 11.25 1.25 8Z"
            fill="none"
            stroke={color.textSecondary}
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
          <Circle cx={8} cy={8} r={2.1} fill={color.textSecondary} />
        </>
      ) : (
        <>
          <Circle cx={8} cy={8} r={8} fill={color.tones.accent.solid} />
          <Path
            d="M4.6 8.2l2.35 2.35L11.5 5.9"
            fill="none"
            stroke={color.tones.accent.onSolid}
            strokeWidth={1.9}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
    </Svg>
  );
}

/** A key to the `marks` a list shows, each beside its name; nothing when it shows none. */
export function MarkLegend({ marks }: { readonly marks: Iterable<Mark> }) {
  const shown = new Set(marks);
  const kinds = (['seen', 'passed'] as const).filter((mark) => shown.has(mark));
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
