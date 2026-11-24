import { a11yState, Pressable, Surface, Text, useTheme } from '@reactive/silk-native';
import { oklch } from '@reactive/silk-core/color';
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';

const SHADOW_INK = oklch(0, 0, 0);

interface PillOption<T extends string> {
  readonly value: T;
  readonly label: string;
  /** Drawn before the label. */
  readonly icon?: ReactNode;
}

interface Props<T extends string> {
  /** Names the choice for screen readers. */
  readonly label: string;
  readonly options: readonly PillOption<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  /** Shows each option's icon alone, its label only for screen readers. */
  readonly iconsOnly?: boolean;
}

/** A switch between a few options, in a sunken pill; the chosen one is raised. */
export function PillChoice<T extends string>({
  label,
  options,
  value,
  onChange,
  iconsOnly,
}: Props<T>) {
  const { theme } = useTheme();
  const { color, shadow } = theme.semantic;
  return (
    <Surface
      elevation="sunken"
      border="subtle"
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={styles.track}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={iconsOnly ? option.label : undefined}
            {...a11yState({ checked: selected })}
            onPress={() => onChange(option.value)}
            style={[
              styles.option,
              iconsOnly ? styles.iconOption : styles.labelOption,
              selected && {
                backgroundColor: color.surfaceRaised,
                shadowColor: SHADOW_INK,
                shadowOpacity: shadow.raised.opacity,
                shadowRadius: 6,
                shadowOffset: { width: 0, height: 2 },
                elevation: 2,
              },
            ]}
          >
            {option.icon}
            {iconsOnly ? null : (
              <Text role="label" tone={selected ? 'primary' : 'secondary'}>
                {option.label}
              </Text>
            )}
          </Pressable>
        );
      })}
    </Surface>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', borderRadius: 999, padding: 3 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 999,
    paddingVertical: 8,
  },
  // Labelled options share the pill's width.
  labelOption: { flex: 1 },
  // A round slot as tall as a labelled option, and as wide. No `flex` at all: natively `flex: 1`
  // sets a basis of 0 under an `auto` basis, and React Native Web reads `flex: 0` as one; either beats the width.
  iconOption: { width: 36 },
});
