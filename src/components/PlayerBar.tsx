import { Spinner, Text, useTheme } from '@reactive/silk-native';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import type { Color } from '@/game/replay';
import { pieceColors } from '@/theme/theme';

interface Props {
  readonly name: string;
  readonly detail: string;
  readonly color: Color;
  /** It's this player's turn in the latest position. */
  readonly toMove: boolean;
  readonly thinking?: boolean;
  /** Shown at the end of the bar in place of the turn marker. */
  readonly children?: ReactNode;
}

/** Fixed, so the screen can line other content up with the board below it. */
export const PLAYER_BAR_HEIGHT = 60;
/** The disc's size and the space after it, so the screen can line things up with them. */
export const PLAYER_DISC = { size: 28, gap: 12 } as const;

/** A name plate above or below the board, lit while that side is to move. */
export function PlayerBar({ name, detail, color, toMove, thinking, children }: Props) {
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
        <Text role="headingSm" numberOfLines={1}>
          {name}
        </Text>
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
  bar: { flexDirection: 'row', alignItems: 'center', gap: PLAYER_DISC.gap, height: PLAYER_BAR_HEIGHT },
  piece: {
    width: PLAYER_DISC.size,
    height: PLAYER_DISC.size,
    borderRadius: PLAYER_DISC.size / 2,
    borderWidth: 2.5,
  },
  names: { flex: 1, minWidth: 0 },
});
