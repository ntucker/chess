import { Inline, Text } from '@reactive/silk-native';
import { Pressable, StyleSheet } from 'react-native';

import type { Ply } from '@/game/replay';

interface Props {
  /** Every position of the game; `plies[n]` follows the nth move. */
  readonly plies: readonly Ply[];
  readonly ply: number;
  readonly onGoto: (ply: number) => void;
}

/** The game's moves in notation (1. e4 e5 2. Nf3); tap one to view it. */
export function MoveList({ plies, ply, onGoto }: Props) {
  if (plies.length < 2) {
    return (
      <Text role="bodySm" tone="secondary">
        No moves yet.
      </Text>
    );
  }
  return (
    <Inline gap="1" align="baseline">
      {plies.slice(1).map((position, i) => {
        const n = i + 1;
        return (
          <Pressable
            key={n}
            onPress={() => onGoto(n)}
            accessibilityRole="button"
            accessibilityState={{ selected: n === ply }}
            style={styles.move}
          >
            <Text role="bodySm" tone={n === ply ? 'accent' : 'primary'}>
              {n % 2 === 1 ? `${(n + 1) / 2}. ` : ''}
              {position.move?.san}
            </Text>
          </Pressable>
        );
      })}
    </Inline>
  );
}

const styles = StyleSheet.create({
  move: { paddingHorizontal: 2, paddingVertical: 2 },
});
