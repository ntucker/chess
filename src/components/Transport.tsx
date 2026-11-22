import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, useTheme } from '@reactive/silk-native';
import { type ComponentProps, type ReactNode, useEffect, useEffectEvent, useState } from 'react';
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

/**
 * Steps through the game like a player's transport: start, back, forward,
 * end. Holding a step arrow keeps stepping, as a held arrow key does.
 */
export function Transport({ ply, total, onGoto, middle }: Props) {
  const { theme } = useTheme();
  const { color } = theme.semantic;
  const part = useNarrowPart();
  const holdHandlersFor = useHeldStep(ply, total, onGoto);
  const arrow = (step: Step) => {
    const target = ply + step;
    return { step, target, disabled: !inGame(target, total) };
  };
  const buttons: {
    label: string;
    icon: ComponentProps<typeof Ionicons>['name'];
    /** The skip icons are drawn smaller so the step arrows lead. */
    size: number;
    target: number;
    disabled: boolean;
    /** Which way a step arrow steps, and so keeps stepping while held. */
    step?: Step;
  }[] = [
    { label: 'First move', icon: 'play-skip-back', size: 16, target: 0, disabled: ply === 0 },
    {
      label: 'Back',
      icon: 'chevron-back',
      size: 22,
      ...arrow(-1),
    },
    {
      label: 'Forward',
      icon: 'chevron-forward',
      size: 22,
      ...arrow(1),
    },
    {
      label: 'Latest move',
      icon: 'play-skip-forward',
      size: 16,
      target: total,
      disabled: ply === total,
    },
  ];
  const button = ({ label, icon, size, target, disabled, step }: (typeof buttons)[number]) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => onGoto(target)}
      {...(step && holdHandlersFor(step))}
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
      {middle ? <NarrowOnly style={styles.middle}>{middle}</NarrowOnly> : null}
      {button(forward)}
      {jump(latest)}
    </View>
  );
}

type Step = -1 | 1;

/** How long a step arrow is held before it starts stepping again. */
const HOLD_MS = 400;
/** How often a held step arrow steps. */
const REPEAT_MS = 120;

/** Whether `ply` is a position of a game of `total` moves. */
const inGame = (ply: number, total: number) => ply >= 0 && ply <= total;

/**
 * The press handlers for a step arrow that steps by `step`: held, it steps
 * once as the hold starts, then again every REPEAT_MS until let go or at
 * either end of the game. A tap steps once (its `onPress`).
 */
function useHeldStep(ply: number, total: number, onGoto: (ply: number) => void) {
  const [held, setHeld] = useState<Step>();
  const next = held === undefined ? undefined : ply + held;
  // The hold ends at either end of the game, even with the finger still
  // down (the arrow turns disabled), so it doesn't resume if the game grows.
  if (next !== undefined && !inGame(next, total)) setHeld(undefined);
  const goto = useEffectEvent(onGoto);
  useEffect(() => {
    if (next === undefined) return;
    const timer = setTimeout(() => goto(next), REPEAT_MS);
    return () => clearTimeout(timer);
  }, [next]);
  return (step: Step) => ({
    delayLongPress: HOLD_MS,
    onLongPress: () => {
      onGoto(ply + step);
      setHeld(step);
    },
    onPressOut: () => setHeld(undefined),
  });
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
  // Grows into any room the stepper is given, such as the review's whole row; in a name bar it has none.
  middle: { flexGrow: 1 },
  button: {
    width: STEP_BUTTON_WIDTH,
    ...stepButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
