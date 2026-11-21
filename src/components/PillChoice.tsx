import { a11yState, Pressable, Surface, Text, useTheme } from '@reactive/silk-native';
import { oklch } from '@reactive/silk-core';
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';

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
}

/** A switch between a few options, in a sunken pill; the chosen one is raised. */
export function PillChoice<T extends string>({ label, options, value, onChange }: Props<T>) {
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
            {...a11yState({ checked: selected })}
            onPress={() => onChange(option.value)}
            style={[
              styles.option,
              selected && {
                backgroundColor: color.surfaceRaised,
                shadowColor: oklch(0, 0, 0),
                shadowOpacity: shadow.raised.opacity,
                shadowRadius: 6,
                shadowOffset: { width: 0, height: 2 },
                elevation: 2,
              },
            ]}
          >
            {option.icon}
            <Text role="label" tone={selected ? 'primary' : 'secondary'}>
              {option.label}
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
});
