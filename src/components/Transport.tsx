import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, useTheme } from '@reactive/silk-native';
import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { NarrowOnly, useNarrowPart } from '@/theme/Narrow';

interface Props {
  readonly ply: number;
  readonly total: number;
  readonly onGoto: (ply: number) => void;
  /**
   * On a narrow page, a control between the step arrows, in place of the
   * jumps to the first and latest move (such as the lesson's scoresheet
   * opener). Elsewhere the stepper keeps its four buttons.
   */
  readonly middle?: ReactNode;
}

/** Steps through the game like a player's transport: start, back, forward, end. */
export function Transport({ ply, total, onGoto, middle }: Props) {
  const { theme } = useTheme();
  const { color } = theme.semantic;
  const part = useNarrowPart();
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
    {
      label: 'Forward',
      icon: 'chevron-forward',
      size: 22,
      target: ply + 1,
      disabled: ply === total,
    },
    {
      label: 'Latest move',
      icon: 'play-skip-forward',
      size: 16,
      target: total,
      disabled: ply === total,
    },
  ];
  const button = ({ label, icon, size, target, disabled }: (typeof buttons)[number]) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => onGoto(target)}
      style={({ pressed, hovered }) => [
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
  );
  /** A jump to either end: wide-only beside a middle, in a View since a Pressable can't carry the part. */
  const jump = (entry: (typeof buttons)[number]) =>
    middle ? (
      <View key={entry.label} {...part('wide-only')}>
        {button(entry)}
      </View>
    ) : (
      button(entry)
    );
  const [first, back, forward, latest] = buttons;
  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: color.surfaceRaised, borderColor: color.borderSubtle },
      ]}
    >
      {jump(first)}
      {button(back)}
      {middle ? <NarrowOnly>{middle}</NarrowOnly> : null}
      {button(forward)}
      {jump(latest)}
    </View>
  );
}

const STEP_BUTTON_WIDTH = 44;

/** A stepper button's size and shape, for a middle that sits in line with them. */
export const stepButton = { height: 36, borderRadius: 999 } as const;

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderRadius: 999,
    borderWidth: 1,
    padding: 4,
    gap: 4,
  },
  button: {
    width: STEP_BUTTON_WIDTH,
    ...stepButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
