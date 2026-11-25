import { Pressable, Stack, Surface, Text, useTheme } from '@reactive/silk-native';
import { StyleSheet, View } from 'react-native';

import { percent } from '@/analysis/quality';
import { Eyebrow, useLabelled } from '@/components/Eyebrow';
import { Notation } from '@/components/Notation';
import { InfoMark, Tip } from '@/components/Tip';
import { numberedMove } from '@/game/replay';
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
 * each: its name, or the mistake, then three meters: how often games reach
 * it, how often the opponent plays the mistake there, and what the mistake
 * gives away ("#" where the punishment mates). A row's progress mark leads
 * it, as the move's row has it in the candidate list. Pressing a row plays
 * Act I and hands the learner the board at the cue.
 */
export function OpportunityList({ lesson, band, progress, tip, onPlay, density }: Props) {
  const rows = lessonOpportunities(lesson, band);
  const marks = opportunityMarks(lesson, progress, rows);
  const labelled = useLabelled();
  const compact = density === 'compact';
  const styles = compact ? COMPACT : COMFORTABLE;
  const list = rows.length ? (
    rows.map((row) => (
      <Row
        key={markId(row.key, row.move.uci)}
        row={row}
        mark={marks.get(markId(row.key, row.move.uci))}
        styles={styles}
        onPlay={onPlay}
      />
    ))
  ) : (
    <Text role="caption" tone="secondary" style={styles.empty}>
      No line of the guide reaches the mistakes it marks.
    </Text>
  );
  const heading = (
    <Tip tip={tip} style={STATIC.tipped}>
      <Eyebrow>Opportunities</Eyebrow>
      <InfoMark size={INFO_SIZE} />
    </Tip>
  );
  if (compact) {
    return (
      <Stack style={STATIC.compact}>
        {heading}
        <View>{list}</View>
      </Stack>
    );
  }
  return (
    <Stack style={labelled}>
      {heading}
      <Surface elevation="sunken" border="subtle" radius="md" style={STATIC.card}>
        {list}
      </Surface>
    </Stack>
  );
}

/** The heading's info mark, about as tall as the eyebrow's capitals. */
const INFO_SIZE = 13;

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
  const cost = move.mistake?.cost;
  const payoff = mates ? '#' : cost === undefined ? '–' : `+${Math.round(cost * 100)}`;
  const meters: readonly (readonly [string, number])[] = [
    [percent(reach), reach],
    [share === undefined ? '–' : percent(share), share ?? 0],
    [payoff, mates ? 1 : Math.min((cost ?? 0) / FULL_COST, 1)],
  ];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[
        move.mistake?.name,
        mistake,
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
          {move.mistake?.name ?? <Notation>{mistake}</Notation>}
        </Text>
        {move.mistake?.name ? (
          <Text role="caption" tone="secondary" style={STATIC.mono} numberOfLines={1}>
            <Notation>{mistake}</Notation>
          </Text>
        ) : null}
      </View>
      <View style={STATIC.meters} aria-hidden>
        {meters.map(([label, fill], i) => (
          <View key={i} style={styles.meter}>
            <Text role="caption" tone="secondary" style={STATIC.mono}>
              {label}
            </Text>
            <View style={[STATIC.track, { backgroundColor: color.tones.neutral.subtle }]}>
              <View
                style={[
                  STATIC.fill,
                  { width: `${fill * 100}%`, backgroundColor: color.tones.accent.solid },
                ]}
              />
            </View>
          </View>
        ))}
      </View>
    </Pressable>
  );
}

const STATIC = StyleSheet.create({
  tipped: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  compact: { gap: 4 },
  card: { overflow: 'hidden', paddingVertical: 4 },
  mark: { width: MARK_SIZE, height: MARK_SIZE },
  title: { flexGrow: 1, flexShrink: 1, gap: 1 },
  mono: { fontFamily: fonts.mono },
  meters: { flexDirection: 'row', gap: 6 },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2 },
});

/** A density's row and meter sizes: a phone's rows are 44 tall, the touch size. */
function densityStyles(meter: number, row: object) {
  return StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, outlineOffset: -2, ...row },
    meter: { width: meter, gap: 3 },
    empty: { paddingVertical: 8 },
  });
}
type Styles = ReturnType<typeof densityStyles>;

const COMPACT = densityStyles(32, { minHeight: 44 });
const COMFORTABLE = densityStyles(44, { paddingVertical: 8, paddingHorizontal: 14 });
