import {
  Popover,
  Pressable,
  Surface,
  Text,
  useReducedMotion,
  useTheme,
} from '@reactive/silk-native';
import { type ComponentRef, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { type EntryExitAnimationFunction, withDelay } from 'react-native-reanimated';

import { type Captures, type MaterialRole, VALUES } from '@/game/material';
import { type Color, colorName, COLORS, opposite } from '@/game/replay';
import { springs } from '@/motion/spring';
import { springTo } from '@/motion/springTo';
import { fonts } from '@/theme/theme';
import { plural } from '@/words';

import { tickHold } from './haptics';
import { PieceGlyph } from './PieceGlyph';

const WEB = process.env.EXPO_OS === 'web';

/** Glyph size, a little over the name beside it so the pieces read at a glance. */
const SIZE = 20;
/** How much of a glyph the next piece of the same kind covers. */
const OVERLAP = SIZE * 0.45;
/** The most glyphs a chip draws: past it, each kind shows once with its count. */
const MOST_GLYPHS = 4;

interface Props {
  readonly captures: Captures;
  /** Whose bar it sits on: the chip shows what this side is up. */
  readonly color: Color;
}

/**
 * What `color` is up on the board, as lichess shows it: its lead in points
 * (`+2`) and the other side's pieces it is up, on a small raised pill. Once
 * anything has been taken and the material is even, the chip shows `=`, so
 * the full lists stay in reach; before that, and on the side behind, there
 * is none.
 *
 * Holding it, or a resting mouse, shows both sides' full lists in a card
 * until let go; a tap or click pins the card until the next one, a press
 * outside it, or Back.
 */
export function CapturesChip({ captures, color }: Props) {
  const { pieces, lead } = captures.material[color];
  const even = COLORS.every((side) => captures.material[side].pieces.length === 0);
  const anyTaken = COLORS.some((side) => captures.taken[side].length > 0);
  const [card, setCard] = useState<'peek' | 'pin'>();
  const anchor = useRef<ComponentRef<typeof View>>(null);
  if (pieces.length === 0 && !(even && anyTaken)) return null;

  const peek = () => setCard((was) => was ?? 'peek');
  const unpeek = () => setCard((was) => (was === 'peek' ? undefined : was));
  return (
    <>
      <Pressable
        ref={anchor}
        accessibilityRole="button"
        accessibilityLabel={even ? 'Even material' : upBy(pieces, lead)}
        accessibilityHint="Shows the pieces each side has taken"
        aria-expanded={card !== undefined}
        hitSlop={6}
        onPress={() => setCard((was) => (was === 'pin' ? undefined : 'pin'))}
        onLongPress={() => {
          tickHold();
          peek();
        }}
        onPressOut={unpeek}
        onHoverIn={peek}
        onHoverOut={unpeek}
        style={styles.chip}
      >
        <Surface elevation="raised" style={styles.pill}>
          {even ? (
            <Text role="label" style={styles.lead}>
              =
            </Text>
          ) : (
            <>
              {lead > 0 ? (
                <Text role="label" style={styles.lead}>
                  +{lead}
                </Text>
              ) : null}
              <Pieces pieces={pieces} color={opposite(color)} />
            </>
          )}
        </Surface>
      </Pressable>
      <Popover.Root
        open={card !== undefined}
        onOpenChange={(open) => {
          if (!open) setCard(undefined);
        }}
        anchor={anchor}
      >
        <Popover.Content
          role="dialog"
          aria-label="Pieces taken"
          align="start"
          sideOffset={6}
          // A peek leaves focus where it is, as a tooltip does; a pin moves it in.
          onOpenAutoFocus={(event) => {
            if (card === 'peek') event.preventDefault();
          }}
        >
          <CapturesCard captures={captures} />
        </Popover.Content>
      </Popover.Root>
    </>
  );
}

/**
 * `pieces` of one color, grouped by kind with each group stacked; past
 * `MOST_GLYPHS`, each kind once with its count ("♟×3").
 */
function Pieces({
  pieces,
  color,
}: {
  readonly pieces: readonly MaterialRole[];
  readonly color: Color;
}) {
  const { theme } = useTheme();
  const groups = groupByRole(pieces);
  const counted = pieces.length > MOST_GLYPHS;
  return (
    <View style={styles.pieces}>
      {groups.map(([role, count], group) => (
        <View key={role} style={[styles.group, group > 0 && styles.nextGroup]}>
          {Array.from({ length: counted ? 1 : count }, (_, i) => (
            <View key={i} style={i > 0 && styles.stacked}>
              <PieceGlyph role={role} color={color} size={SIZE} />
            </View>
          ))}
          {counted && count > 1 ? (
            <Text
              role="caption"
              style={[styles.count, { color: theme.semantic.color.textSecondary }]}
            >
              ×{count}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

/** Both sides' full lists, with their points, and one line on who is ahead. */
function CapturesCard({ captures }: { readonly captures: Captures }) {
  // Shown at once on the web, where Reanimated's entrances don't run here (as in MotionList),
  // and when motion is reduced.
  const still = useReducedMotion();
  const fan = !WEB && !still;
  return (
    <View style={styles.card}>
      {COLORS.map((side) => (
        <View key={side} style={styles.cardRow}>
          <Text role="caption" tone="secondary" style={styles.took}>
            {`${colorName(side)} took`}
          </Text>
          <View style={styles.fan}>
            {captures.taken[side].map((role, i) => (
              <Animated.View key={i} entering={fan ? FAN[Math.min(i, FAN.length - 1)] : undefined}>
                <PieceGlyph role={role} color={opposite(side)} size={SIZE} />
              </Animated.View>
            ))}
          </View>
          <Text role="label" style={styles.points}>
            {pointsOf(captures.taken[side])}
          </Text>
        </View>
      ))}
      <Text role="bodySm">{standing(captures)}</Text>
    </View>
  );
}

/** "White is 2 points up: a knight for a pawn.", or level, with the trade if any. */
export function standing({ material }: Captures) {
  const [ahead, behind] =
    material.white.lead > 0 ? (['white', 'black'] as const) : (['black', 'white'] as const);
  const lead = material[ahead].lead;
  const trade = [material[ahead].pieces, material[behind].pieces]
    .filter((pieces) => pieces.length > 0)
    .map(named)
    .join(' for ');
  if (lead === 0) return trade ? `Level on points: ${trade}.` : 'Level.';
  return `${colorName(ahead)} is ${plural(lead, 'point')} up${trade ? `: ${trade}` : ''}.`;
}

/** "Up a rook and 2 pawns, 7 points ahead", for screen readers. */
function upBy(pieces: readonly MaterialRole[], lead: number) {
  const ahead = lead > 0 ? `, ${plural(lead, 'point')} ahead` : '';
  return `Up ${named(pieces)}${ahead}`;
}

/** "a rook and 2 pawns". */
function named(pieces: readonly MaterialRole[]) {
  const parts = groupByRole(pieces).map(([role, n]) => (n === 1 ? `a ${role}` : plural(n, role)));
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}

/** Each role in `pieces` with how many times it appears, in their order. */
function groupByRole(pieces: readonly MaterialRole[]): [MaterialRole, number][] {
  const counts = new Map<MaterialRole, number>();
  for (const role of pieces) counts.set(role, (counts.get(role) ?? 0) + 1);
  return [...counts];
}

const pointsOf = (pieces: readonly MaterialRole[]) =>
  pieces.reduce((sum, role) => sum + VALUES[role], 0);

/** How far apart the card's pieces fan out of the chip, one after another. */
const FAN_STAGGER_MS = 18;
function fanIn(delay: number): EntryExitAnimationFunction {
  return () => {
    'worklet';
    const spring = (to: number) => withDelay(delay, springTo(to, springs.snappy));
    return {
      // From a little smaller and to the left.
      initialValues: { opacity: 0, transform: [{ translateX: -6 }, { scale: 0.6 }] },
      animations: {
        opacity: spring(1),
        transform: [{ translateX: spring(0) }, { scale: spring(1) }],
      },
    };
  };
}

/**
 * The fan's entrances, by piece: each starts a stagger after the one before,
 * the last for any further. Built after `fanIn`, whose worklet must exist first.
 */
const FAN = Array.from({ length: 8 }, (_, i) => fanIn(i * FAN_STAGGER_MS));

const styles = StyleSheet.create({
  // flexShrink is a weight against the name's 1 in PlayerBar: kept far above
  // it so the chip gives way long before the name does.
  chip: { flexShrink: 1000, minWidth: 0 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    height: SIZE + 6,
    // Surface's radii stop at lg: a pill is round end to end.
    borderRadius: 999,
  },
  lead: { fontFamily: fonts.mono, flexShrink: 0 },
  pieces: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, overflow: 'hidden' },
  group: { flexDirection: 'row', alignItems: 'center' },
  stacked: { marginLeft: -OVERLAP },
  nextGroup: { marginLeft: 2 },
  count: { fontFamily: fonts.mono, marginLeft: 1 },
  card: { gap: 8, minWidth: 220 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  took: { width: 72 },
  fan: { flexDirection: 'row', flexWrap: 'wrap', flex: 1, gap: 1 },
  points: { fontFamily: fonts.mono, minWidth: 24, textAlign: 'right' },
});
