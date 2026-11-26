import { Button, Stack, Text } from '@reactive/silk-native';
import { useState } from 'react';
import { type StyleProp, StyleSheet, type TextStyle, View } from 'react-native';

import type { ReviewQuality } from '@/analysis/quality';
import { Eyebrow } from '@/components/Eyebrow';
import { haptic } from '@/components/haptics';
import { qualityTip, TippedBadge } from '@/components/QualityBadge';
import { Sheet } from '@/components/Sheet';
import { type Color, opposite } from '@/game/replay';
import { LABELS_BEST_FIRST, type Tally } from '@/review/review';
import type { Review } from '@/review/useReview';
import { NarrowOnly, useNarrowPart } from '@/theme/Narrow';
import { qualityLooks } from '@/theme/moveQuality';
import { fonts } from '@/theme/theme';

/** How many labels a row of a narrow page's grid holds. */
const COLUMNS = 3;

/**
 * The labels the tally lists for `sides`' counts: every label, but an
 * opportunity's move only where one was played, since most lessons have none.
 */
const listedLabels = (...sides: Tally[]) =>
  LABELS_BEST_FIRST.filter(
    (quality) => quality !== 'opportunity' || sides.some((counts) => counts[quality]),
  );

interface Props {
  readonly tally: Review['tally'];
  readonly learner: Color;
}

/**
 * How many moves got each label, at the start of the review: on a wide page
 * a table of both sides; on a narrow one the learner's in a grid, with a
 * "Both sides" button that opens the table in a sheet. Each badge's tooltip
 * gives its label's rule.
 */
export function ReviewTally({ tally, learner }: Props) {
  const part = useNarrowPart();
  const [open, setOpen] = useState(false);
  const table = <TallyTable tally={tally} learner={learner} />;
  return (
    <>
      <View {...part('wide-only')}>{table}</View>
      <NarrowOnly>
        <Stack gap="1">
          <View style={styles.head}>
            <Eyebrow>Your moves</Eyebrow>
            <Button
              variant="outline"
              size="sm"
              onPress={() => {
                haptic('sheetOpened');
                setOpen(true);
              }}
            >
              Both sides
            </Button>
          </View>
          <TallyGrid counts={tally[learner]} />
        </Stack>
      </NarrowOnly>
      <Sheet open={open} title="Both sides" onClose={() => setOpen(false)}>
        {table}
      </Sheet>
    </>
  );
}

/** Both sides' counts, a row a label: the learner's column, then the opponent's. */
function TallyTable({ tally, learner }: Props) {
  const sides = [tally[learner], tally[opposite(learner)]];
  return (
    <View role="table" aria-label="Moves by label">
      <View role="row" style={styles.row}>
        <View style={styles.label} />
        {['You', 'Opponent'].map((side) => (
          <Eyebrow key={side} numberOfLines={1} style={styles.column}>
            {side}
          </Eyebrow>
        ))}
      </View>
      {listedLabels(...sides).map((quality) => (
        <View key={quality} role="row" style={styles.row}>
          <Label quality={quality} dim={sides.every((counts) => !counts[quality])} />
          {sides.map((counts, n) => (
            <Count key={n} count={counts[quality]} style={styles.column} />
          ))}
        </View>
      ))}
    </View>
  );
}

/** One side's counts in `COLUMNS` columns, as a phone has room for. */
function TallyGrid({ counts }: { readonly counts: Tally }) {
  const labels = listedLabels(counts);
  const rows = Array.from({ length: Math.ceil(labels.length / COLUMNS) }, (_, row) =>
    labels.slice(row * COLUMNS, (row + 1) * COLUMNS),
  );
  return (
    <View>
      {rows.map((row) => (
        <View key={row[0]} style={styles.gridRow}>
          {row.map((quality) => (
            <View key={quality} style={styles.cell}>
              <Label quality={quality} dim={!counts[quality]} />
              <Count count={counts[quality]} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

/** A label's badge and its name, faded when no move got it. */
function Label({ quality, dim }: { readonly quality: ReviewQuality; readonly dim: boolean }) {
  return (
    <View style={[styles.label, dim && styles.dim]}>
      <TippedBadge quality={quality} size={BADGE_SIZE} tip={qualityTip(quality)} />
      <Text role="bodySm" numberOfLines={1} style={styles.name}>
        {qualityLooks[quality].short}
      </Text>
    </View>
  );
}

/** A count, faded at 0. */
function Count({
  count = 0,
  style,
}: {
  readonly count?: number;
  readonly style?: StyleProp<TextStyle>;
}) {
  return (
    <Text role="body" style={[styles.count, style, !count && styles.dim]}>
      {count}
    </Text>
  );
}

const BADGE_SIZE = 16;

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 26 },
  gridRow: { flexDirection: 'row', columnGap: 14 },
  cell: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', minHeight: 30 },
  label: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flexShrink: 1 },
  // Room for the spaced-out "Opponent" heading, so it stays on one line.
  column: { width: 96, textAlign: 'right' },
  count: { fontFamily: fonts.mono, fontVariant: ['tabular-nums'] },
  dim: { opacity: 0.45 },
});
