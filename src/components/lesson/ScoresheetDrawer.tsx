import Ionicons from '@expo/vector-icons/Ionicons';
import { a11yState, Inline, Pressable, Text, useTheme } from '@reactive/silk-native';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import { Eyebrow, labelled } from '@/components/Eyebrow';
import { HeaderButton } from '@/components/HeaderButton';
import { Scoresheet } from '@/components/Scoresheet';
import { stepButton } from '@/components/Transport';
import { useScreenKeys } from '@/components/useScreenKeys';
import { numberedMove } from '@/game/replay';
import { narrowPart } from '@/theme/narrow';
import { fonts } from '@/theme/theme';

interface Props extends Omit<ComponentProps<typeof Scoresheet>, 'fill'> {
  /** Its close button, or Escape. */
  readonly onClose: () => void;
}

/**
 * The scoresheet of a narrow web page, opened from the move stepper: it takes
 * the panel's place under the board, so the board stays in view while the
 * learner taps through the moves, and stays open until closed. Its head holds
 * the jumps to the first and latest move, which the stepper leaves out there.
 * Shown while mounted, on a narrow web page only (narrow.css).
 */
export function ScoresheetDrawer({ onClose, ...scoresheet }: Props) {
  const { plies, ply, onGoto } = scoresheet;
  /** The ply of the latest move: `plies` begins with the start position. */
  const last = plies.length - 1;
  useScreenKeys((event) => {
    if (event.key === 'Escape') onClose();
  });
  return (
    <View {...narrowPart('scoresheet-drawer')} aria-label="Scoresheet" style={labelled}>
      <Inline align="center" justify="between" wrap="nowrap">
        <Eyebrow>Scoresheet</Eyebrow>
        <Inline align="center" gap="1" wrap="nowrap">
          <Jump label="Start" disabled={ply === 0} onPress={() => onGoto(0)} />
          <Jump label="Latest" disabled={ply === last} onPress={() => onGoto(last)} />
          <HeaderButton
            icon="chevron-down"
            iconSize={20}
            accessibilityRole="button"
            accessibilityLabel="Close the scoresheet"
            onPress={onClose}
          />
        </Inline>
      </Inline>
      <Scoresheet {...scoresheet} fill />
    </View>
  );
}

/**
 * The move stepper's middle on a narrow page (`Transport`): the move on the
 * board, which opens the scoresheet drawer, or closes it again.
 */
export function ScoresheetOpener({
  san,
  ply,
  disabled,
  open,
  onToggle,
}: {
  /** The move that led to the position shown, in SAN: none at the start. */
  readonly san?: string;
  readonly ply: number;
  readonly disabled: boolean;
  readonly open: boolean;
  readonly onToggle: () => void;
}) {
  const { theme } = useTheme();
  const { color } = theme.semantic;
  const move = shownMove(san, ply);
  const ink = disabled ? color.tones.neutral.disabledFg : undefined;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Scoresheet, ${move}`}
      {...a11yState({ expanded: open })}
      disabled={disabled}
      onPress={onToggle}
      style={({ pressed, hovered }) => [
        stepButton,
        styles.opener,
        { backgroundColor: open || pressed || hovered ? color.tones.neutral.subtle : undefined },
      ]}
    >
      <Text
        role="body"
        numberOfLines={1}
        style={[styles.openerText, { color: ink ?? color.textPrimary }]}
      >
        {move}
      </Text>
      <Ionicons
        name={open ? 'chevron-down' : 'chevron-up'}
        size={12}
        color={ink ?? color.textSecondary}
      />
    </Pressable>
  );
}

/** The move on the board as the stepper names it, "12…Nc6" (`ply` moves in), or "Start" before any. */
export const shownMove = (san: string | undefined, ply: number) =>
  san ? numberedMove(san, ply, '…') : 'Start';

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
  /*
   * Wide enough for "12…Nxd5", so the stepper keeps its width from move to
   * move, and no wider than the two jumps it replaces, so the name bar keeps its room.
   */
  opener: {
    width: 88,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 6,
  },
  openerText: { fontFamily: fonts.mono, fontSize: 14 },
});
