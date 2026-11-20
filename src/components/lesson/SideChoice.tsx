import { Inline, Text, useTheme } from '@reactive/silk-native';
import { StyleSheet, View } from 'react-native';

import { PillChoice } from '@/components/PillChoice';
import { type Color, COLORS, colorName } from '@/game/replay';
import { pieceColors } from '@/theme/pieceColors';

interface Props {
  /** The side the learner plays now. */
  readonly side: Color;
  /**
   * Plays as `side` from its start, in a lesson too, where the name bars'
   * discs no longer swap: chosen in a sheet, starting over is meant.
   */
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
    <Inline gap="3" align="center" wrap="nowrap">
      {/* Screen readers hear it as the choice's name. */}
      <Text role="label" tone="secondary" aria-hidden>
        {PLAY_AS}
      </Text>
      <View style={styles.choice}>
        <PillChoice label={PLAY_AS} options={options} value={side} onChange={onChange} />
      </View>
    </Inline>
  );
}

const PLAY_AS = 'Play as';

const styles = StyleSheet.create({
  choice: { flex: 1 },
  // The name bars' disc, small.
  disc: { width: 14, height: 14, borderRadius: 999, borderWidth: 1.5 },
});
