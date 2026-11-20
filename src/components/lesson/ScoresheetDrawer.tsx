import { Pressable, Text, useTheme } from '@reactive/silk-native';
import { useIsFocused } from 'expo-router';
import { type ReactNode, useEffect, useEffectEvent } from 'react';
import { StyleSheet, View } from 'react-native';

import { Eyebrow, labelled } from '@/components/Eyebrow';
import { HeaderButton } from '@/components/HeaderButton';
import { narrowPart } from '@/theme/narrow';

interface Props {
  readonly ply: number;
  readonly total: number;
  readonly onGoto: (ply: number) => void;
  /** Its close button, or Escape. */
  readonly onClose: () => void;
  /** The scoresheet, filling the drawer's height. */
  readonly children: ReactNode;
}

/**
 * The scoresheet of a narrow web page, opened from the move stepper: it takes
 * the panel's place under the board, so the board stays in view while the
 * learner taps through the moves, and stays open until closed. Its head holds
 * the jumps to the first and latest move, which the stepper leaves out there.
 * Shown while mounted, on a narrow web page only (narrow.css).
 */
export function ScoresheetDrawer({ ply, total, onGoto, onClose, children }: Props) {
  const focused = useIsFocused();
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === 'Escape') onClose();
  });
  // A screen left underneath stays mounted, so it stops listening.
  useEffect(() => {
    if (process.env.EXPO_OS !== 'web' || !focused) return;
    const listener = (event: KeyboardEvent) => onKey(event);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [focused]);
  return (
    <View {...narrowPart('scoresheet-drawer')} aria-label="Scoresheet" style={labelled}>
      <View style={styles.head}>
        <Eyebrow>Scoresheet</Eyebrow>
        <View style={styles.actions}>
          <Jump label="Start" disabled={ply === 0} onPress={() => onGoto(0)} />
          <Jump label="Latest" disabled={ply === total} onPress={() => onGoto(total)} />
          <HeaderButton
            icon="chevron-down"
            iconSize={20}
            accessibilityRole="button"
            accessibilityLabel="Close the scoresheet"
            onPress={onClose}
          />
        </View>
      </View>
      {children}
    </View>
  );
}

/**
 * A jump to either end of the game, in words: quiet text that lights up on
 * hover like the stepper's buttons, and fades out where it would go nowhere.
 */
function Jump({
  label,
  disabled,
  onPress,
}: {
  readonly label: string;
  readonly disabled: boolean;
  readonly onPress: () => void;
}) {
  const { theme } = useTheme();
  const { color } = theme.semantic;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed, hovered }) => [
        styles.jump,
        (pressed || hovered) && !disabled && { backgroundColor: color.tones.neutral.subtle },
      ]}
    >
      <Text
        role="bodySm"
        style={{ color: disabled ? color.tones.neutral.disabledFg : color.tones.accent.text }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  jump: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
