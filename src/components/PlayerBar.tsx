import { Spinner, Text, useTheme } from '@reactive/silk-native';
import type { ReactNode } from 'react';
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';

import type { Material } from '@/game/material';
import { type Color, opposite } from '@/game/replay';
import { NARROW_CSS_LOADS, narrowLength, narrowPart } from '@/theme/narrow';
import { pieceColors } from '@/theme/pieceColors';

import { Captures } from './Captures';

interface Props {
  readonly name: string;
  readonly detail: string;
  /** A shorter `detail` for a narrow web page, where it shares the name's line. */
  readonly brief?: string;
  readonly color: Color;
  /** It's this player's turn in the latest position. */
  readonly toMove: boolean;
  readonly thinking?: boolean;
  /** What this player is up on the board shown. */
  readonly material: Material;
  /** Controls at the end of the bar, such as the move stepper. */
  readonly children?: ReactNode;
  /** The bar's size; the screen fixes its height to line it up with the board. */
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * The disc's size and the space after it, so the screen can line things up
 * with them. A small dot on a narrow web page, to give the board room.
 */
export const PLAYER_DISC = {
  size: narrowLength('player-disc', 28),
  gap: narrowLength('player-disc-gap', 12),
} as const;
const DISC_BORDER = narrowLength('player-disc-border', 2.5);

/** A name plate above or below the board, lit while that side is to move. */
export function PlayerBar({
  name,
  detail,
  brief,
  color,
  toMove,
  thinking,
  material,
  children,
  style,
}: Props) {
  const { theme } = useTheme();
  const { color: c } = theme.semantic;
  const turn = (text: string) => (toMove ? `${text} · to move` : text);
  const caption = {
    role: 'caption',
    tone: toMove ? 'accent' : 'secondary',
    numberOfLines: 1,
    style: styles.detailText,
  } as const;
  return (
    <View style={[styles.bar, style]}>
      <View
        style={[
          styles.piece,
          {
            backgroundColor: pieceColors[color],
            borderColor: toMove ? c.tones.accent.solid : c.tones.neutral.border,
          },
        ]}
      />
      <View {...narrowPart('player-names')} style={styles.names}>
        <View style={styles.nameLine}>
          <Text role="headingSm" numberOfLines={1} style={styles.name}>
            {name}
          </Text>
          <Captures {...material} pieceColor={opposite(color)} />
        </View>
        <Text {...caption} {...(brief ? narrowPart('wide-only') : {})}>
          {turn(detail)}
        </Text>
        {brief && NARROW_CSS_LOADS ? (
          <Text {...caption} {...narrowPart('narrow-only')}>
            {turn(brief)}
          </Text>
        ) : null}
      </View>
      {thinking ? <Spinner size="sm" tone="accent" label={`${name} is thinking`} /> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: PLAYER_DISC.gap.value,
  },
  piece: {
    width: PLAYER_DISC.size.value,
    height: PLAYER_DISC.size.value,
    borderRadius: 999,
    borderWidth: DISC_BORDER.value,
  },
  names: { flex: 1, minWidth: 0 },
  // Where the name's line and the detail share a row (a narrow web page),
  // the detail gives way first when short of room, then the name's line;
  // elsewhere they stack, and these shrink rules have nothing to do.
  nameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    overflow: 'hidden',
    flexShrink: 1,
    minWidth: 0,
  },
  // The detail ends in an ellipsis as it gives way. Its flexShrink is a
  // weight against the name's line's 1, kept far above it, so a short name
  // ("White") stays whole beside a switch at the bar's end.
  detailText: { flexShrink: 1000, minWidth: 0 },
  // The captured pieces give way first (see Captures), then the name ends in
  // an ellipsis; the line is clipped rather than run under the controls.
  name: { flexShrink: 1, minWidth: 0 },
});
