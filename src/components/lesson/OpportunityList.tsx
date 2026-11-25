import Ionicons from '@expo/vector-icons/Ionicons';
import {
  Badge,
  Button,
  Inline,
  Pressable,
  Progress,
  Spinner,
  Stack,
  Surface,
  Text,
  useTheme,
} from '@reactive/silk-native';
import { useDeferredValue, useMemo } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { lostPercent, percent } from '@/analysis/quality';
import { Eyebrow, useLabelled } from '@/components/Eyebrow';
import { Notation } from '@/components/Notation';
import { HeadingTip, Tip } from '@/components/Tip';
import { lastPosition, lastStep, lineText, numberedMove } from '@/game/replay';
import type { Lesson, Uci } from '@/lesson/lesson';
import { opportunityMarks } from '@/lesson/marks';
import { markId } from '@/lesson/mistakes';
import { lessonOpportunities, type Opportunity } from '@/lesson/opportunities';
import type { MaiaRating } from '@/maia/ratings';
import type { Find } from '@/opportunity/finder';
import type { FinderRun } from '@/opportunity/useFinder';
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
  /** Whose games the counts are (`bandPlayers`), for the heading's tooltip. */
  readonly players: string | undefined;
  /** The learner picks a row: the game plays its line, up to the cue. */
  readonly onPlay: (line: readonly Uci[]) => void;
  /** The finder run from a position of the board (`useFinder`), whose finds follow the lesson's. */
  readonly finder: FinderProps;
  /**
   * `compact`, a phone's page: the rows alone, which the page scrolls.
   * `comfortable`, a wide panel: a heading over the rows on a card.
   */
  readonly density: Density;
}

/** The finder's part of the list. */
export interface FinderProps {
  readonly run: FinderRun;
  /** Whether the finder runs from the position the board shows; if not, the button runs it from there. */
  readonly here: boolean;
  /** Whether it has been run on this lesson at all: its finds are from another position when not `here`. */
  readonly started: boolean;
  /** Whose estimate of the replies it reads (`FinderAsk.rating`), named on its source chip. */
  readonly rating: MaiaRating;
  /** Runs the finder from the position the board shows. */
  readonly onFind: () => void;
}

/**
 * The lesson's opportunities (`lessonOpportunities`), best first, one row
 * each: its name over the mistake, or the mistake over the two moves
 * before it, then three meters: how often games reach it, how often the
 * opponent plays the mistake there, and what the mistake gives away ("#"
 * where the punishment mates). A row's progress mark leads
 * it, as the move's row has it in the candidate list. Pressing a row plays
 * Act I and hands the learner the board at the cue. After them, the
 * finder's (`FinderPart`): run from the board's position, its finds join
 * as Stockfish confirms them, ranked apart, since their shares are Maia's
 * estimate rather than counted games.
 */
export function OpportunityList({
  lesson,
  band,
  progress,
  players,
  onPlay,
  finder,
  density,
}: Props) {
  // Worked out after the screen shows, and again after a change of lesson,
  // band or progress, since a big lesson's walk takes a moment.
  const asked = useMemo(() => ({ lesson, band, progress }), [lesson, band, progress]);
  const shown = useDeferredValue<typeof asked | undefined>(asked, undefined);
  const labelled = useLabelled();
  const compact = density === 'compact';
  const styles = compact ? COMPACT : COMFORTABLE;
  const rows = shown ? lessonOpportunities(shown.lesson, shown.band) : [];
  const marks = shown ? opportunityMarks(shown.lesson, shown.progress, rows) : [];
  // A lesson that marks none of the opponent's mistakes lists the finder's alone.
  const list = rows.map((row, i) => (
    <Row
      key={markId(row.key, row.move.uci)}
      row={lessonRow(row, marks[i])}
      styles={styles}
      onPlay={onPlay}
    />
  ));
  const found = <FinderPart finder={finder} styles={styles} onPlay={onPlay} />;
  return (
    <Stack style={compact ? STATIC.compact : labelled}>
      <HeadingTip tip={listTip(players)} style={STATIC.heading}>
        <Eyebrow>Opportunities</Eyebrow>
      </HeadingTip>
      {compact ? (
        <View>
          {list}
          {found}
        </View>
      ) : (
        <Surface elevation="sunken" border="subtle" radius="md" style={STATIC.card}>
          {list}
          {found}
        </Surface>
      )}
    </Stack>
  );
}

/**
 * The finder's part of the list: its heading and source chip, then its finds
 * best first, or the button that runs it from the board's position, and
 * while it runs a spinner.
 */
function FinderPart({
  finder: { run, here, started, rating, onFind },
  styles,
  onPlay,
}: {
  readonly finder: FinderProps;
  readonly styles: Styles;
  readonly onPlay: (line: readonly Uci[]) => void;
}) {
  // Each row replays its line: once per run's answer, not per render.
  const rows = useMemo(() => run.finds.map(findRow), [run.finds]);
  const note = rows.length
    ? undefined
    : run.running
      ? 'The first finds take a few minutes.'
      : here
        ? 'No opportunity found from here.'
        : undefined;
  return (
    <View style={styles.finder}>
      <Inline gap="2" align="center" style={STATIC.finderHead}>
        <HeadingTip tip={FINDER_TIP}>
          <Eyebrow>{here || !started ? 'From this position' : 'From an earlier position'}</Eyebrow>
        </HeadingTip>
        <Tip tip={sourceTip(rating)}>
          <Badge variant="soft" tone="neutral" size="sm">
            {`Maia ${rating}`}
          </Badge>
        </Tip>
        {run.running ? (
          <Spinner size="sm" tone="accent" label="Searching for opportunities" />
        ) : null}
      </Inline>
      {rows.map((row) => (
        <Row key={row.line.join(' ')} row={row} styles={styles} onPlay={onPlay} />
      ))}
      {note ? (
        <Text role="caption" tone="secondary" style={STATIC.empty}>
          {note}
        </Text>
      ) : null}
      {here ? null : (
        <Inline style={STATIC.finderButton}>
          <Button size="sm" variant="outline" onPress={onFind}>
            <Ionicons name="search" size={15} /> Find from here
          </Button>
        </Inline>
      )}
    </View>
  );
}

const FINDER_TIP =
  "Looks for the opponent's likely mistakes from the board's position, on this device: Stockfish judges each reply players are likely to make. Each find joins the list once confirmed; the whole search takes a while.";

/** What the finder's shares are: Maia's estimate at `rating`, never counted games. */
const sourceTip = (rating: MaiaRating) =>
  `Estimates: how often players rated about ${rating} play each move is Maia ${rating}'s guess, not counted games, so these rows rank apart from the guide's.`;

/** What the list ranks and what its rows' meters show, against `players` where counted. */
const listTip = (players: string | undefined) =>
  `The opponent's mistakes the guide marks, best first by what knowing each is worth per game${
    players ? ` against ${players}` : ''
  }. Each row: how often your games reach it, how often the mistake is played there, and what it gives away (# is mate). Tap one to play up to your cue.`;

/** The payoff meter's full width: a mistake costing this much of the expected score, or mate. */
const FULL_COST = 0.6;

/** What a row shows, from the lesson's opportunity (`lessonRow`) or a find (`findRow`). */
interface ListRow {
  /** The moves from the start through the mistake, which a press plays. */
  readonly line: readonly Uci[];
  /** The mistake as the scoresheet names it. */
  readonly san: string;
  readonly name?: string;
  readonly reach?: number;
  readonly share?: number;
  readonly mates: boolean;
  /** The expected score the mistake gives away, where judged. */
  readonly cost?: number;
  readonly mark?: Mark;
}

const lessonRow = (
  { move, san, line, reach, share, mates }: Opportunity,
  mark: Mark | undefined,
): ListRow => ({
  line,
  san,
  name: move.mistake?.name,
  reach,
  share,
  mates,
  cost: move.mistake?.cost,
  mark,
});

/** A find as a row: its line through the mistake, and whether its punishment mates where Act III ends. */
function findRow({ line, mistake, replies, payoff, reach, share, cost }: Find): ListRow {
  const through = [...line, mistake];
  return {
    line: through,
    san: lastStep(through).move!.san,
    reach,
    share,
    mates: lastPosition([...through, replies[0], ...payoff]).result?.reason === 'checkmate',
    cost,
  };
}

function Row({
  row,
  styles,
  onPlay,
}: {
  readonly row: ListRow;
  readonly styles: Styles;
  readonly onPlay: (line: readonly Uci[]) => void;
}) {
  const { color } = useTheme().theme.semantic;
  const { san, line, name, reach, share, mates, cost, mark } = row;
  const mistake = numberedMove(san, line.length);
  // Without a name, the two moves before it tell apart one mistake played after several.
  const caption = name ? mistake : leadIn(line);
  // As the candidate list shows the mistake's cost.
  const lost = cost === undefined ? undefined : lostPercent(cost);
  const payoff = mates ? '#' : lost ? `\u2212${lost}` : '–';
  // Each meter's number and how full its bar is: reach, how often, payoff.
  const meters = [
    { meter: 'reach', label: reach === undefined ? '–' : percent(reach), fill: reach ?? 0 },
    { meter: 'share', label: share === undefined ? '–' : percent(share), fill: share ?? 0 },
    { meter: 'payoff', label: payoff, fill: mates ? 1 : Math.min((cost ?? 0) / FULL_COST, 1) },
  ] as const;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[
        name ?? mistake,
        caption,
        reach !== undefined && `reached in ${percent(reach)} of games`,
        share !== undefined && `played ${percent(share)} of the time`,
        mates ? 'punished with mate' : lost && `gives away ${lost}`,
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
        {meters.map(({ meter, label, fill }) => (
          <View key={meter} style={styles.meter}>
            <Text role="caption" tone="secondary" style={STATIC.mono}>
              {label}
            </Text>
            <Progress size="sm" value={fill} max={1} />
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
  finderHead: { paddingTop: 10, paddingBottom: 2 },
  finderButton: { paddingVertical: 8 },
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
    finder: { paddingHorizontal: row.paddingHorizontal },
  });
}
type Styles = ReturnType<typeof densityStyles>;

const COMPACT = densityStyles(32, { minHeight: 44 });
const COMFORTABLE = densityStyles(44, { paddingVertical: 8, paddingHorizontal: 14 });
