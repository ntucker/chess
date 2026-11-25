import { Pressable, Stack, Surface, Text, useTheme } from '@reactive/silk-native';
import { useDeferredValue } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { lostPercent, percent } from '@/analysis/quality';
import { Eyebrow, useLabelled } from '@/components/Eyebrow';
import { MeterBar } from '@/components/MeterBar';
import { Notation } from '@/components/Notation';
import { HeadingTip } from '@/components/Tip';
import { lineText, numberedMove } from '@/game/replay';
import type { Lesson, Uci } from '@/lesson/lesson';
import { opportunityMarks } from '@/lesson/marks';
import { markId } from '@/lesson/mistakes';
import { lessonOpportunities, type Opportunity } from '@/lesson/opportunities';
import type { Mark, MarkedPositions } from '@/progress/progress';
import type { Density } from '@/theme/Narrow';
import { fonts } from '@/theme/theme';

import { MARK_SIZE, ProgressMark, SPOKEN_MARKS } from './ProgressMark';

interface Props {
  readonly lesson: Lesson;
  /** The opponent's rating band (`opponentBand`), which ranks the rows. */
  readonly band: number | undefined;
  /** The lesson's progress, for each row's mark. */
  readonly progress: MarkedPositions;
  /** What the list ranks and what its meters show, in a tooltip on its heading. */
  readonly tip: string;
  /** The learner picks a row: the game plays its line, up to the cue. */
  readonly onPlay: (line: readonly Uci[]) => void;
  /**
   * `compact`, a phone's page: the rows alone, which the page scrolls.
   * `comfortable`, a wide panel: a heading over the rows on a card.
   */
  readonly density: Density;
}

/**
 * The lesson's opportunities (`lessonOpportunities`), best first, one row
 * each: its name over the mistake, or the mistake over the two moves
 * before it, then three meters: how often games reach it, how often the
 * opponent plays the mistake there, and what the mistake gives away ("#"
 * where the punishment mates). A row's progress mark leads
 * it, as the move's row has it in the candidate list. Pressing a row plays
 * Act I and hands the learner the board at the cue.
 */
export function OpportunityList({ lesson, band, progress, tip, onPlay, density }: Props) {
  // Worked out after the screen shows, since a big lesson's list takes a moment.
  const listing = useDeferredValue<Lesson | undefined>(lesson, undefined);
  const labelled = useLabelled();
  const compact = density === 'compact';
  const styles = compact ? COMPACT : COMFORTABLE;
  const rows = listing ? lessonOpportunities(listing, band) : [];
  const marks = listing ? opportunityMarks(listing, progress, rows) : [];
  const list = !listing ? null : rows.length ? (
    rows.map((row, i) => (
      <Row
        key={markId(row.key, row.move.uci)}
        row={row}
        mark={marks[i]}
        styles={styles}
        onPlay={onPlay}
      />
    ))
  ) : (
    <Text role="caption" tone="secondary" style={STATIC.empty}>
      No line of the guide reaches the mistakes it marks.
    </Text>
  );
  return (
    <Stack style={compact ? STATIC.compact : labelled}>
      <HeadingTip tip={tip} style={STATIC.heading}>
        <Eyebrow>Opportunities</Eyebrow>
      </HeadingTip>
      {compact ? (
        <View>{list}</View>
      ) : (
        <Surface elevation="sunken" border="subtle" radius="md" style={STATIC.card}>
          {list}
        </Surface>
      )}
    </Stack>
  );
}

/** The payoff meter's full width: a mistake costing this much of the expected score, or mate. */
const FULL_COST = 0.6;

function Row({
  row,
  mark,
  styles,
  onPlay,
}: {
  readonly row: Opportunity;
  readonly mark?: Mark;
  readonly styles: Styles;
  readonly onPlay: (line: readonly Uci[]) => void;
}) {
  const { color } = useTheme().theme.semantic;
  const { move, san, line, reach, share, mates } = row;
  const mistake = numberedMove(san, line.length);
  const { name } = move.mistake ?? {};
  // Without a name, the two moves before it tell apart one mistake played after several.
  const caption = name ? mistake : leadIn(line);
  const cost = move.mistake?.cost;
  // As the candidate list shows the mistake's cost.
  const lost = cost === undefined ? undefined : lostPercent(cost);
  const payoff = mates ? '#' : lost ? `−${lost}` : '–';
  // Each meter's number and how full its bar is: reach, how often, payoff.
  const meters = [
    { name: 'reach', label: percent(reach), fill: reach },
    { name: 'share', label: share === undefined ? '–' : percent(share), fill: share ?? 0 },
    { name: 'payoff', label: payoff, fill: mates ? 1 : Math.min((cost ?? 0) / FULL_COST, 1) },
  ] as const;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[
        name ?? mistake,
        caption,
        `reached in ${percent(reach)} of games`,
        share !== undefined && `played ${percent(share)} of the time`,
        mates ? 'punished with mate' : cost !== undefined && `gives away ${percent(cost)}`,
        mark && SPOKEN_MARKS[mark],
      ]
        .filter(Boolean)
        .join(', ')}
      accessibilityHint="Plays the line up to your cue"
      onPress={() => onPlay(line)}
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: color.tones.neutral.subtle },
      ]}
    >
      <View style={STATIC.mark}>{mark ? <ProgressMark mark={mark} /> : null}</View>
      <View style={STATIC.title} aria-hidden>
        <Text role="body" numberOfLines={1}>
          {name ?? <Notation>{mistake}</Notation>}
        </Text>
        {caption ? (
          <Text role="caption" tone="secondary" style={STATIC.mono} numberOfLines={1}>
            <Notation>{caption}</Notation>
          </Text>
        ) : null}
      </View>
      <View style={STATIC.meters} aria-hidden>
        {meters.map(({ name, label, fill }) => (
          <View key={name} style={styles.meter}>
            <Text role="caption" tone="secondary" style={STATIC.mono}>
              {label}
            </Text>
            <MeterBar fill={fill} color={color.tones.accent.solid} />
          </View>
        ))}
      </View>
    </Pressable>
  );
}

/** The two moves before a line's last, numbered: "after 5.e5 Ne4"; nothing for a line that short. */
function leadIn(line: readonly Uci[]): string | undefined {
  const before = line.length - 1;
  return before < 2 ? undefined : `after ${lineText(line.slice(0, before), before - 2)}`;
}

const STATIC = StyleSheet.create({
  // As wide as its words, so its tip opens over them alone.
  heading: { alignSelf: 'flex-start' },
  compact: { gap: 4 },
  empty: { paddingVertical: 8 },
  card: { overflow: 'hidden', paddingVertical: 4 },
  mark: { width: MARK_SIZE, height: MARK_SIZE },
  title: { flexGrow: 1, flexShrink: 1, gap: 1 },
  mono: { fontFamily: fonts.mono },
  meters: { flexDirection: 'row', gap: 6 },
});

/** A density's row and meter sizes: a phone's rows are 44 tall, the touch size. */
function densityStyles(meter: number, row: ViewStyle) {
  return StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, outlineOffset: -2, ...row },
    meter: { width: meter, gap: 3 },
  });
}
type Styles = ReturnType<typeof densityStyles>;

const COMPACT = densityStyles(32, { minHeight: 44 });
const COMFORTABLE = densityStyles(44, { paddingVertical: 8, paddingHorizontal: 14 });
