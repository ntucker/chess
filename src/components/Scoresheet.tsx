import Ionicons from '@expo/vector-icons/Ionicons';
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
  /** Each move's label once it's judged: `qualities[n]` labels the move that leads to `plies[n + 1]`. */
  readonly qualities: readonly (MoveQuality | undefined)[];
  readonly ply: number;
  /** The ply after a move that fell into a trap, marked as the mistake. */
  readonly trapped?: number;
  /**
   * Why each move has no label yet, as the review marks it: `unjudged[n]`
   * for the move that leads to `plies[n + 1]`. A move still waiting for its
   * analyses gets a dashed ring where its badge will go; one whose search
   * gave up gets a warning mark.
   */
  readonly unjudged?: readonly (Unjudged | undefined)[];
  readonly onGoto: (ply: number) => void;
  /** Fills the height it is given and scrolls within it, instead of growing to at most 280px. */
  readonly fill?: boolean;
}

/** Why a move has no label: its analyses haven't come in, or a search they need gave up. */
export type Unjudged = 'waiting' | 'failed';

/**
 * The moves as a two-column scoresheet (1. e4 e5), each with its label (or
 * why it has none yet), and a move that fell into a trap marked; tap one to
 * see it.
 */
export function Scoresheet({ plies, qualities, ply, trapped, unjudged, onGoto, fill }: Props) {
  const scroll = useRef<ScrollViewInstance>(null);
  const san = (n: number) => plies[n]?.move?.san;

  const rows: number[] = [];
  for (let n = 1; n < plies.length; n += 2) rows.push(n);

  return (
    <Surface
      elevation="sunken"
      border="subtle"
      radius="md"
      style={[styles.sheet, fill && styles.fill]}
    >
      {rows.length === 0 ? (
        <Text role="bodySm" tone="secondary" style={styles.empty}>
          The moves will appear here.
        </Text>
      ) : (
        <ScrollView
          ref={scroll}
          style={fill ? styles.fill : styles.scroll}
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
              whiteUnjudged={unjudged?.[white - 1]}
              blackUnjudged={unjudged?.[white]}
              selected={inRow(ply, white)}
              trapped={inRow(trapped, white)}
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
  readonly whiteUnjudged?: Unjudged;
  readonly blackUnjudged?: Unjudged;
  /** The shown ply, when it's in this row. */
  readonly selected?: number;
  /** The trapped ply, when it's in this row. */
  readonly trapped?: number;
  readonly striped: boolean;
  readonly onGoto: (ply: number) => void;
}

function Row({
  white,
  whiteSan,
  blackSan,
  whiteQuality,
  blackQuality,
  whiteUnjudged,
  blackUnjudged,
  selected,
  trapped,
  striped,
  onGoto,
}: RowProps) {
  const { theme } = useTheme();
  const { color } = theme.semantic;

  const cell = (n: number, san?: string, quality?: MoveQuality, unjudged?: Unjudged) => {
    if (san === undefined) return <View style={styles.cell} />;
    const current = n === selected;
    const trap = n === trapped;
    const { accent, danger, neutral } = color.tones;
    // The move shown, a move that fell into a trap, or any other: ink, fill, and fill on hover.
    const [ink, fill, hoverFill] = current
      ? [accent.onSolid, accent.solid, accent.solid]
      : trap
        ? [danger.text, danger.subtle, danger.subtleHover]
        : [color.textPrimary, undefined, neutral.subtle];
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: current }}
        accessibilityLabel={
          trap ? `${san}, fell into a trap` : unjudged && `${san}, ${UNJUDGED_SPOKEN[unjudged]}`
        }
        onPress={() => onGoto(n)}
        style={({ hovered }) => [
          styles.cell,
          { borderRadius: theme.semantic.radius.sm },
          trap && { borderColor: danger.border },
          { backgroundColor: hovered ? hoverFill : fill },
        ]}
      >
        {trap && <Ionicons name="warning" size={BADGE_SIZE - 2} color={ink} />}
        <Text role="body" style={[styles.san, { color: ink }]}>
          {san}
        </Text>
        {quality && <QualityBadge quality={quality} size={BADGE_SIZE} />}
        {unjudged === 'waiting' && (
          <View style={[styles.ring, { borderColor: current ? ink : color.textSecondary }]} />
        )}
        {unjudged === 'failed' && (
          <Ionicons
            name="alert-circle-outline"
            size={BADGE_SIZE}
            color={current ? ink : color.textSecondary}
          />
        )}
      </Pressable>
    );
  };

  return (
    <View style={[styles.row, striped && { backgroundColor: color.tones.neutral.subtle }]}>
      <Text role="bodySm" tone="secondary" style={styles.number}>
        {(white + 1) / 2}
      </Text>
      {cell(white, whiteSan, whiteQuality, whiteUnjudged)}
      {cell(white + 1, blackSan, blackQuality, blackUnjudged)}
    </View>
  );
}

/** A label's badge beside its move, about the height of the notation's capitals. */
const BADGE_SIZE = 15;

/** What a screen reader hears after a move with no label yet. */
const UNJUDGED_SPOKEN: Readonly<Record<Unjudged, string>> = {
  waiting: 'not judged yet',
  failed: "Stockfish couldn't judge it",
};

/**
 * `ply` when it is in the row whose White move leads to `white` or after it;
 * only that row gets a value, so the rest keep their props and skip
 * re-rendering as the player steps.
 */
const inRow = (ply: number | undefined, white: number) =>
  ply === white || ply === white + 1 ? ply : undefined;

const styles = StyleSheet.create({
  sheet: { overflow: 'hidden' },
  scroll: { maxHeight: 280 },
  fill: { flex: 1, minHeight: 0 },
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
    // Room for a trapped move's outline, so marking one doesn't shift the row.
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: 9,
    paddingVertical: 4,
    outlineOffset: 1,
  },
  san: { fontFamily: fonts.mono, fontSize: 15 },
  // Where the badge will go, a little inside its disc.
  ring: {
    width: BADGE_SIZE - 2,
    height: BADGE_SIZE - 2,
    margin: 1,
    borderRadius: BADGE_SIZE,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    opacity: 0.7,
  },
});
