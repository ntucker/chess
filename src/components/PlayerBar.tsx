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
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  piece: { width: 28, height: 28, borderRadius: 14, borderWidth: 2.5 },
  names: { flex: 1, minWidth: 0 },
});
