import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@reactive/silk-native';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

interface Props {
  readonly ply: number;
  readonly total: number;
  readonly onGoto: (ply: number) => void;
}

/** Steps through the game like a player's transport: start, back, forward, end. */
export function Transport({ ply, total, onGoto }: Props) {
  const { theme } = useTheme();
  const { color } = theme.semantic;
  const buttons: {
    label: string;
    icon: ComponentProps<typeof Ionicons>['name'];
    /** The skip icons are drawn smaller so the step arrows lead. */
    size: number;
    target: number;
    disabled: boolean;
  }[] = [
    { label: 'First move', icon: 'play-skip-back', size: 16, target: 0, disabled: ply === 0 },
    { label: 'Back', icon: 'chevron-back', size: 22, target: ply - 1, disabled: ply === 0 },
    { label: 'Forward', icon: 'chevron-forward', size: 22, target: ply + 1, disabled: ply === total },
    { label: 'Latest move', icon: 'play-skip-forward', size: 16, target: total, disabled: ply === total },
  ];
  return (
    <View
      style={[styles.bar, { backgroundColor: color.surfaceRaised, borderColor: color.borderSubtle }]}
    >
      {buttons.map(({ label, icon, size, target, disabled }) => (
        <Pressable
          key={label}
          accessibilityRole="button"
          accessibilityLabel={label}
          disabled={disabled}
          onPress={() => onGoto(target)}
          style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
            styles.button,
            (pressed || hovered) && !disabled && { backgroundColor: color.tones.neutral.subtle },
          ]}
        >
          <Ionicons
            name={icon}
            size={size}
            color={disabled ? color.tones.neutral.disabledFg : color.textPrimary}
          />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderRadius: 999,
    borderWidth: 1,
    padding: 4,
    gap: 4,
  },
  button: {
    width: 44,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
