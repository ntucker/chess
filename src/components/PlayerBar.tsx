import { Spinner, Text, useTheme } from '@reactive/silk-native';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import type { Material } from '@/game/material';
import type { Color } from '@/game/replay';
import { pieceColors } from '@/theme/theme';

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

/** Fixed, so the screen can line other content up with the board below it. */
export const PLAYER_BAR_HEIGHT = 60;

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
          <Captures {...material} />
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
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, height: PLAYER_BAR_HEIGHT },
  piece: { width: 28, height: 28, borderRadius: 14, borderWidth: 2.5 },
  names: { flex: 1, minWidth: 0 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  // The name stays whole; a long run of captured pieces is clipped instead.
  name: { flexShrink: 0 },
});
