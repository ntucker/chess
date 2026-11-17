import { Surface, Text, useTheme } from '@reactive/silk-native';
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
  const scroll = useRef<ScrollViewInstance>(null);
  const san = (n: number) => plies[n]?.move?.san;

  const rows: number[] = [];
  for (let n = 1; n < plies.length; n += 2) rows.push(n);

  return (
    <Surface elevation="sunken" border="subtle" radius="md" style={styles.sheet}>
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
          {rows.map((white, i) => (
            <Row
              key={white}
              white={white}
              whiteSan={san(white)}
              blackSan={san(white + 1)}
              // Only the row holding the shown move gets a value, so the rest
              // keep their props and skip re-rendering as the player steps.
              selected={ply === white || ply === white + 1 ? ply : undefined}
              striped={i % 2 === 1}
              onGoto={onGoto}
            />
          ))}
        </ScrollView>
      )}
    </Surface>
  );
}

interface RowProps {
  /** White's ply; Black's is the next one. */
  readonly white: number;
  readonly whiteSan?: string;
  readonly blackSan?: string;
  /** The shown ply, when it's in this row. */
  readonly selected?: number;
  readonly striped: boolean;
  readonly onGoto: (ply: number) => void;
}

function Row({ white, whiteSan, blackSan, selected, striped, onGoto }: RowProps) {
  const { theme } = useTheme();
  const { color } = theme.semantic;

  const cell = (n: number, san?: string) => {
    if (san === undefined) return <View style={styles.cell} />;
    const current = n === selected;
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
          {san}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.row, striped && { backgroundColor: color.tones.neutral.subtle }]}>
      <Text role="bodySm" tone="secondary" style={styles.number}>
        {(white + 1) / 2}
      </Text>
      {cell(white, whiteSan)}
      {cell(white + 1, blackSan)}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { overflow: 'hidden' },
  scroll: { maxHeight: 280 },
  empty: { padding: 16, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 2 },
  number: { width: 36, textAlign: 'right', paddingRight: 10, fontFamily: fonts.mono },
  cell: { flex: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5 },
  san: { fontFamily: fonts.mono, fontSize: 15 },
});
