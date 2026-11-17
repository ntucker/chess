import { Text, useTheme } from '@reactive/silk-native';
import { useRef } from 'react';
import { Pressable, ScrollView, type ScrollViewInstance, StyleSheet, View } from 'react-native';

import type { Ply } from '@/game/replay';
import { fonts } from '@/theme/theme';

interface Props {
  /** Every position of the game; `plies[n]` follows the nth move. */
  readonly plies: readonly Ply[];
  readonly ply: number;
  readonly onGoto: (ply: number) => void;
}

/** The moves as a two-column scoresheet (1. e4 e5); tap one to see it. */
export function Scoresheet({ plies, ply, onGoto }: Props) {
  const { theme } = useTheme();
  const { color } = theme.semantic;
  const scroll = useRef<ScrollViewInstance>(null);

  const rows: { number: number; white?: number; black?: number }[] = [];
  for (let n = 1; n < plies.length; n += 2) {
    rows.push({ number: (n + 1) / 2, white: n, black: n + 1 < plies.length ? n + 1 : undefined });
  }

  const cell = (n: number | undefined) => {
    if (n === undefined) return <View style={styles.cell} />;
    const current = n === ply;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: current }}
        onPress={() => onGoto(n)}
        style={({ hovered }: { hovered?: boolean }) => [
          styles.cell,
          current
            ? { backgroundColor: color.tones.accent.solid }
            : hovered && { backgroundColor: color.tones.neutral.subtle },
        ]}
      >
        <Text
          role="body"
          style={[styles.san, { color: current ? color.tones.accent.onSolid : color.textPrimary }]}
        >
          {plies[n].move?.san}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.sheet, { backgroundColor: color.surfaceSunken, borderColor: color.borderSubtle }]}>
      {rows.length === 0 ? (
        <Text role="bodySm" tone="secondary" style={styles.empty}>
          The moves will appear here.
        </Text>
      ) : (
        <ScrollView
          ref={scroll}
          style={styles.scroll}
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
        >
          {rows.map((row, i) => (
            <View
              key={row.number}
              style={[styles.row, i % 2 === 1 && { backgroundColor: color.tones.neutral.subtle }]}
            >
              <Text role="bodySm" tone="secondary" style={styles.number}>
                {row.number}
              </Text>
              {cell(row.white)}
              {cell(row.black)}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  scroll: { maxHeight: 280 },
  empty: { padding: 16, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 2 },
  number: { width: 36, textAlign: 'right', paddingRight: 10, fontFamily: fonts.mono },
  cell: { flex: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5 },
  san: { fontFamily: fonts.mono, fontSize: 15 },
});
