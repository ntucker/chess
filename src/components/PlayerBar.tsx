import { Spinner, Text, useTheme } from '@reactive/silk-native';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import type { Material } from '@/game/material';
import { type Color, opposite } from '@/game/replay';
import { phoneLength } from '@/theme/phone';
import { pieceColors } from '@/theme/pieceColors';

import { Captures } from './Captures';

interface Props {
  readonly name: string;
  readonly detail: string;
  readonly color: Color;
  /** It's this player's turn in the latest position. */
  readonly toMove: boolean;
  readonly thinking?: boolean;
  /** What this player is up on the board shown. */
  readonly material: Material;
  /** Shown at the end of the bar in place of the turn marker. */
  readonly children?: ReactNode;
}

/**
 * Fixed, so the screen can line other content up with the board below it.
 * Shorter on a phone-width web page.
 */
export const PLAYER_BAR_HEIGHT = phoneLength('player-bar-height', 60);
/** The disc's size and the space after it, so the screen can line things up with them. */
export const PLAYER_DISC = { size: 28, gap: 12 } as const;

/** A name plate above or below the board, lit while that side is to move. */
export function PlayerBar({
  name,
  detail,
  color,
  toMove,
  thinking,
  material,
  children,
}: Props) {
  const { theme } = useTheme();
  const { color: c } = theme.semantic;
  return (
    <View style={styles.bar}>
      <View
        style={[
          styles.piece,
          {
            backgroundColor: pieceColors[color],
            borderColor: toMove ? c.tones.accent.solid : c.tones.neutral.border,
          },
        ]}
      />
      <View style={styles.names}>
        <View style={styles.nameLine}>
          <Text role="headingSm" numberOfLines={1} style={styles.name}>
            {name}
          </Text>
          <Captures {...material} pieceColor={opposite(color)} />
        </View>
        <Text role="caption" tone={toMove ? 'accent' : 'secondary'} numberOfLines={1}>
          {toMove ? `${detail} · to move` : detail}
        </Text>
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
    gap: PLAYER_DISC.gap,
    height: PLAYER_BAR_HEIGHT.value,
  },
  piece: {
    width: PLAYER_DISC.size,
    height: PLAYER_DISC.size,
    borderRadius: PLAYER_DISC.size / 2,
    borderWidth: 2.5,
  },
  names: { flex: 1, minWidth: 0 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 10, overflow: 'hidden' },
  // The captured pieces give way first (see Captures), then the name ends in
  // an ellipsis; the line is clipped rather than run under the controls.
  name: { flexShrink: 1, minWidth: 0 },
});
