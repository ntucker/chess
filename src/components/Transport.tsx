import Ionicons from '@expo/vector-icons/Ionicons';
import { a11yState, Pressable, Text, useTheme } from '@reactive/silk-native';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import { numberedMove } from '@/game/replay';
import { NARROW_CSS_LOADS, narrowPart } from '@/theme/narrow';
import { fonts } from '@/theme/theme';

interface Props {
  readonly ply: number;
  readonly total: number;
  readonly onGoto: (ply: number) => void;
  /**
   * On a narrow web page, the move shown between the step arrows, as a
   * button that opens the scoresheet; the jumps to the first and latest move
   * go there too. Elsewhere the stepper keeps its four buttons.
   */
  readonly scoresheet?: {
    /** The move that led to the position shown, in SAN: none at the start. */
    readonly san?: string;
    readonly open: boolean;
    readonly onToggle: () => void;
  };
}

/** Steps through the game like a player's transport: start, back, forward, end. */
export function Transport({ ply, total, onGoto, scoresheet: requested }: Props) {
  const { theme } = useTheme();
  // Only narrow.css can swap the jumps for the opener.
  const scoresheet = NARROW_CSS_LOADS ? requested : undefined;
  const { color } = theme.semantic;
  const buttons: {
    label: string;
    icon: ComponentProps<typeof Ionicons>['name'];
    /** The skip icons are drawn smaller so the step arrows lead. */
    size: number;
    target: number;
    disabled: boolean;
    /** A jump to either end, which the scoresheet holds instead on a narrow page. */
    jump: boolean;
  }[] = [
    {
      label: 'First move',
      icon: 'play-skip-back',
      size: 16,
      target: 0,
      disabled: ply === 0,
      jump: true,
    },
    {
      label: 'Back',
      icon: 'chevron-back',
      size: 22,
      target: ply - 1,
      disabled: ply === 0,
      jump: false,
    },
    {
      label: 'Forward',
      icon: 'chevron-forward',
      size: 22,
      target: ply + 1,
      disabled: ply === total,
      jump: false,
    },
    {
      label: 'Latest move',
      icon: 'play-skip-forward',
      size: 16,
      target: total,
      disabled: ply === total,
      jump: true,
    },
  ];
  const hover = color.tones.neutral.subtle;
  const button = ({ label, icon, size, target, disabled, jump }: (typeof buttons)[number]) => {
    const pressable = (
      <Pressable
        key={label}
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={disabled}
        onPress={() => onGoto(target)}
        style={({ pressed, hovered }) => [
          styles.button,
          (pressed || hovered) && !disabled && { backgroundColor: hover },
        ]}
      >
        <Ionicons
          name={icon}
          size={size}
          color={disabled ? color.tones.neutral.disabledFg : color.textPrimary}
        />
      </Pressable>
    );
    // In a View, so a jump can be wide-only, which a Pressable's own props can't carry.
    return jump && scoresheet ? (
      <View key={label} {...narrowPart('wide-only')}>
        {pressable}
      </View>
    ) : (
      pressable
    );
  };
  const [first, back, forward, latest] = buttons;
  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: color.surfaceRaised, borderColor: color.borderSubtle },
      ]}
    >
      {button(first)}
      {button(back)}
      {scoresheet ? (
        <View {...narrowPart('narrow-only')}>
          <ScoresheetOpener {...scoresheet} ply={ply} disabled={total === 0} />
        </View>
      ) : null}
      {button(forward)}
      {button(latest)}
    </View>
  );
}

/**
 * The stepper's middle button on a narrow page: the move on the board, which
 * opens the scoresheet below, or closes it again.
 */
function ScoresheetOpener({
  san,
  ply,
  open,
  onToggle,
  disabled,
}: NonNullable<Props['scoresheet']> & { readonly ply: number; readonly disabled: boolean }) {
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
        styles.button,
        styles.readout,
        { backgroundColor: open || pressed || hovered ? color.tones.neutral.subtle : undefined },
      ]}
    >
      <Text
        role="body"
        numberOfLines={1}
        style={[styles.readoutText, { color: ink ?? color.textPrimary }]}
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
  /*
   * Wide enough for "12…Nxd5", so the bar keeps its width from move to move,
   * and no wider than the two jumps it replaces, so the name bar keeps its room.
   */
  readout: { width: 88, flexDirection: 'row', gap: 4, paddingHorizontal: 6 },
  readoutText: { fontFamily: fonts.mono, fontSize: 14 },
});
