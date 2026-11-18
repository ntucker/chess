import { useTheme } from '@reactive/silk-native';
import { StyleSheet, View } from 'react-native';

import { COLORS, type Color, colorName } from '@/game/replay';
import { pieceColors } from '@/theme/theme';

import { PillChoice } from './PillChoice';

interface Props {
  readonly value: Color;
  readonly onChange: (color: Color) => void;
}

/** A two-way switch between White and Black. */
export function SideChooser({ value, onChange }: Props) {
  const { theme } = useTheme();
  const options = COLORS.map((side) => ({
    value: side,
    label: colorName(side),
    icon: (
      <View
        style={[
          styles.swatch,
          {
            backgroundColor: pieceColors[side],
            borderColor: theme.semantic.color.tones.neutral.border,
          },
        ]}
      />
    ),
  }));
  return <PillChoice label="Play as" options={options} value={value} onChange={onChange} />;
}

const styles = StyleSheet.create({
  swatch: { width: 14, height: 14, borderRadius: 7, borderWidth: 1 },
});
