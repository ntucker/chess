import { useTheme } from '@reactive/silk-native';
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';

/**
 * A thin bar filled `fill` (0 to 1) of its width in `color`, as wide as
 * `style` or its parent makes it: a share, a reach or a payoff in a list's row.
 */
export function MeterBar({
  fill,
  color,
  style,
}: {
  readonly fill: number;
  readonly color: string;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const { tones } = useTheme().theme.semantic.color;
  return (
    <View style={[styles.track, { backgroundColor: tones.neutral.subtle }, style]}>
      <View style={[styles.fill, { width: `${fill * 100}%`, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2 },
});
