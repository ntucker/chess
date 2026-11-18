import { Pressable, Surface, Text, useTheme } from '@reactive/silk-native';
import { useRef } from 'react';
import { ScrollView, type ScrollViewInstance, StyleSheet, View } from 'react-native';

import type { MoveQuality } from '@/analysis/quality';
import type { Ply } from '@/game/replay';
import { fonts } from '@/theme/theme';

import { QualityBadge } from './QualityBadge';

interface Props {
  /** Every position of the game; `plies[n]` follows the nth move. */
  readonly plies: readonly Ply[];
  /** Each move's label once it's judged: `qualities[n - 1]` labels the nth move. */
  readonly qualities: readonly (MoveQuality | undefined)[];
  readonly ply: number;
  readonly onGoto: (ply: number) => void;
}

/** The moves as a two-column scoresheet (1. e4 e5), each with its label; tap one to see it. */
export function Scoresheet({ plies, qualities, ply, onGoto }: Props) {
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
          contentContainerStyle={styles.content}
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
        >
          {rows.map((white, i) => (
            <Row
              key={white}
              white={white}
              whiteSan={san(white)}
              blackSan={san(white + 1)}
              whiteQuality={qualities[white - 1]}
              blackQuality={qualities[white]}
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
  readonly whiteQuality?: MoveQuality;
  readonly blackQuality?: MoveQuality;
  /** The shown ply, when it's in this row. */
  readonly selected?: number;
  readonly striped: boolean;
  readonly onGoto: (ply: number) => void;
}

function Row({
  white,
  whiteSan,
  blackSan,
  whiteQuality,
  blackQuality,
  selected,
  striped,
  onGoto,
}: RowProps) {
  const { theme } = useTheme();
  const { color } = theme.semantic;

  const cell = (n: number, san?: string, quality?: MoveQuality) => {
    if (san === undefined) return <View style={styles.cell} />;
    const current = n === selected;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: current }}
        onPress={() => onGoto(n)}
        style={({ hovered }) => [
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
        {quality && <QualityBadge quality={quality} size={BADGE_SIZE} />}
      </Pressable>
    );
  };

  return (
    <View style={[styles.row, striped && { backgroundColor: color.tones.neutral.subtle }]}>
      <Text role="bodySm" tone="secondary" style={styles.number}>
        {(white + 1) / 2}
      </Text>
      {cell(white, whiteSan, whiteQuality)}
      {cell(white + 1, blackSan, blackQuality)}
    </View>
  );
}

/** A label's badge beside its move, about the height of the notation's capitals. */
const BADGE_SIZE = 15;

const styles = StyleSheet.create({
  sheet: { overflow: 'hidden' },
  scroll: { maxHeight: 280 },
  // Room for the first and last cells' focus rings, which the scroll clips.
  content: { paddingVertical: 2 },
  empty: { padding: 16, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  number: { width: 36, textAlign: 'right', paddingRight: 10, fontFamily: fonts.mono },
  // Overrides the theme's 2px focus-ring offset: 1px out, the 2px ring fits
  // in the 4px between cells.
  cell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    outlineOffset: 1,
  },
  san: { fontFamily: fonts.mono, fontSize: 15 },
});
