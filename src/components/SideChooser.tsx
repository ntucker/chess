import { Surface, Text, useTheme } from '@reactive/silk-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { COLORS, type Color, colorName } from '@/game/replay';
import { pieceColors } from '@/theme/theme';

interface Props {
  readonly value: Color;
  readonly onChange: (color: Color) => void;
}

/** A two-way switch between White and Black. */
export function SideChooser({ value, onChange }: Props) {
  const { theme } = useTheme();
  const { color, shadow } = theme.semantic;
  return (
    <Surface
      elevation="sunken"
      border="subtle"
      accessibilityRole="radiogroup"
      accessibilityLabel="Play as"
      style={styles.track}
    >
      {COLORS.map((side) => {
        const selected = side === value;
        return (
          <Pressable
            key={side}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(side)}
            style={[
              styles.option,
              selected && {
                backgroundColor: color.surfaceRaised,
                shadowColor: '#000',
                shadowOpacity: shadow.raised.opacity,
                shadowRadius: 6,
                shadowOffset: { width: 0, height: 2 },
                elevation: 2,
              },
            ]}
          >
            <View
              style={[
                styles.swatch,
                {
                  backgroundColor: pieceColors[side],
                  borderColor: color.tones.neutral.border,
                },
              ]}
            />
            <Text role="label" tone={selected ? 'primary' : 'secondary'}>
              {colorName(side)}
            </Text>
          </Pressable>
        );
      })}
    </Surface>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', borderRadius: 999, padding: 3 },
  option: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 999,
    paddingVertical: 8,
  },
  swatch: { width: 14, height: 14, borderRadius: 7, borderWidth: 1 },
});
