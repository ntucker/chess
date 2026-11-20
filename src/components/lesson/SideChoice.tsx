import { Text, useTheme } from '@reactive/silk-native';
import { StyleSheet, View } from 'react-native';

import { PillChoice } from '@/components/PillChoice';
import { type Color, COLORS, colorName } from '@/game/replay';
import { pieceColors } from '@/theme/pieceColors';

interface Props {
  /** The side the learner plays now. */
  readonly side: Color;
  /** Plays as `side` from its start; the name bars' discs do the same. */
  readonly onChange: (side: Color) => void;
}

/** White or Black, for the settings sheet, where the board's discs are out of reach. */
export function SideChoice({ side, onChange }: Props) {
  const { theme } = useTheme();
  const border = theme.semantic.color.tones.neutral.border;
  const options = COLORS.map((color) => ({
    value: color,
    label: colorName(color),
    icon: (
      <View style={[styles.disc, { backgroundColor: pieceColors[color], borderColor: border }]} />
    ),
  }));
  return (
    <View style={styles.row}>
      <Text role="label" tone="secondary">
        Play as
      </Text>
      <View style={styles.choice}>
        <PillChoice label="Play as" options={options} value={side} onChange={onChange} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  choice: { flex: 1 },
  // The name bars' disc, small.
  disc: { width: 14, height: 14, borderRadius: 999, borderWidth: 1.5 },
});
