import Ionicons from '@expo/vector-icons/Ionicons';
import { a11yState, Inline, Pressable, Text, useTheme } from '@reactive/silk-native';
import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useLabelled } from '@/components/Eyebrow';
import { Notation } from '@/components/Notation';
import { Scoresheet, ScoresheetTitle } from '@/components/Scoresheet';
import { stepButton } from '@/components/Transport';
import { shownMove } from '@/game/replay';
import { springs } from '@/motion/spring';
import { useSpringTransition } from '@/motion/useSpringTransition';
import { FIGURINE_ADVANCE, fonts, MONO_ADVANCE } from '@/theme/theme';

interface PageProps extends Omit<ComponentProps<typeof Scoresheet>, 'fill'> {
  /** The game's Review button, first in its head (the lesson's). */
  readonly reviewButton?: ReactNode;
}

/**
 * The scoresheet of a narrow page, under the board, so the board stays in
 * view while the learner taps through the moves: the table filling it,
 * under a head that holds the jumps to the first and latest move, which the
 * stepper leaves out there. It fills its page beside the screen's own
 * (`PhonePages`).
 */
export function ScoresheetPage({ reviewButton, ...scoresheet }: PageProps) {
  const { plies, ply, onGoto } = scoresheet;
  /** The ply of the latest move: `plies` begins with the start position. */
  const last = plies.length - 1;
  const labelled = useLabelled();
  return (
    <View role="region" aria-label="Scoresheet" style={[labelled, styles.page]}>
      <Inline align="center" justify="between" wrap="nowrap">
        <ScoresheetTitle />
        <Inline align="center" gap="1" wrap="nowrap">
          {reviewButton}
          <Jump label="Start" disabled={ply === 0} onPress={() => onGoto(0)} />
          <Jump label="Latest" disabled={ply === last} onPress={() => onGoto(last)} />
        </Inline>
      </Inline>
      <Scoresheet {...scoresheet} fill />
    </View>
  );
}

/**
 * The move stepper's middle on a narrow page (`Transport`): the move on the
 * board, flat in the stepper's capsule, which slides the scoresheet in, or
 * back out. While it shows, the move is lit and the chevron turned over.
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
  readonly disabled?: boolean;
  readonly open: boolean;
  readonly onToggle: () => void;
}) {
  const { theme } = useTheme();
  const { color } = theme.semantic;
  // The chevron turns over as the pages slide.
  const turn = useSpringTransition(springs.snappy);
  const move = shownMove(san, ply);
  const ink = disabled
    ? color.tones.neutral.disabledFg
    : open
      ? color.tones.accent.text
      : undefined;
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
        !disabled && (pressed || hovered) && { backgroundColor: color.tones.neutral.subtle },
      ]}
    >
      <ShownMove san={san} ply={ply} ink={ink} />
      <Animated.View
        style={{
          transform: [{ rotate: open ? '180deg' : '0deg' }],
          // A Reanimated CSS transition, which StyleSheet's types don't know.
          transitionProperty: 'transform',
          ...turn,
        }}
      >
        <Ionicons name="chevron-up" size={CHEVRON_SIZE} color={ink ?? color.textSecondary} />
      </Animated.View>
    </Pressable>
  );
}

/** The move on the board in the stepper's middle (`shownMove`), in `ink`, or the primary ink. */
export function ShownMove({
  san,
  ply,
  ink,
}: {
  readonly san?: string;
  readonly ply: number;
  readonly ink?: string;
}) {
  const { theme } = useTheme();
  return (
    <Text
      role="body"
      numberOfLines={1}
      style={[styles.move, { color: ink ?? theme.semantic.color.textPrimary }]}
    >
      <Notation>{shownMove(san, ply)}</Notation>
    </Text>
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

const MOVE_SIZE = 14;
const OPENER_GAP = 4;
const OPENER_PADDING = 6;
const CHEVRON_SIZE = 12;

const styles = StyleSheet.create({
  // As tall as what holds it and no taller, so its table scrolls within.
  page: { flexGrow: 1, flexShrink: 1, minHeight: 0 },
  jump: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  /*
   * Wide enough for "12…Nxd5" with its piece as an icon (six mono characters
   * and the widest piece), so the stepper keeps its width from move to move,
   * and no wider than the two jumps it replaces, so the name bar keeps its room.
   */
  opener: {
    width:
      Math.ceil(MOVE_SIZE * (6 * MONO_ADVANCE + FIGURINE_ADVANCE)) +
      OPENER_GAP +
      CHEVRON_SIZE +
      2 * OPENER_PADDING,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: OPENER_GAP,
    paddingHorizontal: OPENER_PADDING,
  },
  move: { fontFamily: fonts.mono, fontSize: MOVE_SIZE },
});
