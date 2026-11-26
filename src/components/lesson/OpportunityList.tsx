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
import { type IconAction, IconActions } from '@/components/IconActions';
import { Notation } from '@/components/Notation';
import { HEADING_INFO_SIZE, HeadingTip, InfoMark, Tip } from '@/components/Tip';
import { lastPosition, lastStep, lineText, numberedMove } from '@/game/replay';
import { bandRatings, type Lesson, type PositionKey, type Uci } from '@/lesson/lesson';
import { opportunityMarks } from '@/lesson/marks';
import { markId } from '@/lesson/mistakes';
import { lessonOpportunities, type Opportunity } from '@/lesson/opportunities';
import { RATING_BANDS } from '@/lichess/explorer';
import type { Find } from '@/opportunity/finder';
import { bySource, cueOf, type SavedFind } from '@/opportunity/saved';
import type { FinderRun } from '@/opportunity/useFinder';
import type { ReplySource } from '@/opportunity/walk';
import type { Mark, MarkedPositions } from '@/progress/progress';
import type { Density } from '@/theme/Narrow';
import { fonts } from '@/theme/theme';
import { touchTarget } from '@/theme/touch';

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
  /** The finds the learner saved on this lesson, which follow the lesson's own. */
  readonly saved: SavedProps;
  /** The finder run from a position of the board (`useFinder`), whose finds follow the saved ones. */
  readonly finder: FinderProps;
  /**
   * `compact`, a phone's page: the rows alone, which the page scrolls.
   * `comfortable`, a wide panel: a heading over the rows on a card.
   */
  readonly density: Density;
}

/** The learner's saved finds, and saving or forgetting one. */
export interface SavedProps {
  readonly finds: readonly SavedFind[];
  /** Saves one of the finder's finds, with the numbers of its source. */
  readonly onSave: (find: Find) => void;
  /** Forgets the saved find at `cue` (`cueOf`). */
  readonly onUnsave: (cue: PositionKey) => void;
}

/** The finder's part of the list. */
export interface FinderProps {
  readonly run: FinderRun;
  /**
   * Where it runs from: nowhere yet on this lesson, the position the board
   * shows, or another one (its finds are from there).
   */
  readonly from: 'none' | 'here' | 'elsewhere';
  /** Where its replies come from (`FinderAsk.source`), named on its source chip. */
  readonly source: ReplySource;
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
  saved,
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
  const rows = useMemo(
    () => (shown ? lessonOpportunities(shown.lesson, shown.band) : NONE),
    [shown],
  );
  const marks = shown ? opportunityMarks(shown.lesson, shown.progress, rows) : [];
  const savedCues = useMemo(() => new Set(saved.finds.map(cueOf)), [saved.finds]);
  // A lesson that marks none of the opponent's mistakes lists the saved and the finder's alone.
  const list = rows.map((row, i) => (
    <Row
      key={markId(row.key, row.move.uci)}
      row={lessonRow(row, marks[i])}
      styles={styles}
      onPlay={onPlay}
      // A find saved before the lesson marked it too: the lesson's row lists it, and forgets it.
      bookmark={savedCues.has(row.next) ? unsaveAction(row.next, saved.onUnsave) : undefined}
    />
  ));
  const listed = useMemo(() => new Set(rows.map(({ next }) => next)), [rows]);
  // The finder lists only what neither the lesson nor the saved finds list.
  const taken = useMemo(() => new Set([...listed, ...savedCues]), [listed, savedCues]);
  const found = (
    <>
      <SavedPart saved={saved} listed={listed} styles={styles} onPlay={onPlay} />
      <FinderPart
        finder={finder}
        taken={taken}
        onSave={saved.onSave}
        styles={styles}
        onPlay={onPlay}
      />
    </>
  );
  // Some row shows: a saved or found find is left out only where another row lists its position.
  const anyRow = rows.length > 0 || saved.finds.length > 0 || finder.run.finds.length > 0;
  return (
    <Stack style={compact ? STATIC.compact : labelled}>
      <View style={[STATIC.line, STATIC.headWrap]}>
        <HeadingTip tip={listTip(players)} style={STATIC.heading}>
          <Eyebrow>Opportunities</Eyebrow>
        </HeadingTip>
        {anyRow ? <ColumnHeads styles={styles} /> : null}
      </View>
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
 * The saved finds the lesson doesn't list (`listed`), one group per source
 * (`bySource`) under its own heading and source chip, so no score ranks
 * beside another source's. Each row's bookmark forgets it.
 */
function SavedPart({
  saved: { finds, onUnsave },
  listed,
  styles,
  onPlay,
}: {
  readonly saved: SavedProps;
  readonly listed: ReadonlySet<PositionKey>;
  readonly styles: Styles;
  readonly onPlay: (line: readonly Uci[]) => void;
}) {
  // Each row replays its line: once per change of the saved finds, not per render.
  const groups = useMemo(
    () =>
      bySource(finds)
        .map(({ source, finds: group }) => ({
          source,
          rows: group.map(findRow).filter(({ next }) => !listed.has(next)),
        }))
        .filter(({ rows }) => rows.length),
    [finds, listed],
  );
  return groups.map(({ source, rows }) => (
    <View key={sourceChip(source).label}>
      <Inline gap="2" align="center" style={[styles.finder, STATIC.finderHead]}>
        <HeadingTip tip={SAVED_TIP}>
          <Eyebrow>Saved</Eyebrow>
        </HeadingTip>
        <SourceChip source={source} />
      </Inline>
      {rows.map((row) => (
        <Row
          key={row.next}
          row={row}
          styles={styles}
          onPlay={onPlay}
          bookmark={unsaveAction(row.next, onUnsave)}
        />
      ))}
    </View>
  ));
}

const SAVED_TIP =
  'Finds you saved, kept on this device. The lesson plays each one like its own: your cue, then the payoff.';

/**
 * The finder's part of the list: its heading, source chip and button
 * (`finderAction`), then its finds best first, leaving out any whose mistake
 * leads to a position the lesson's rows or the saved finds already list
 * (`taken`), however its line got there. Each row's bookmark saves it. A
 * spinner shows while it runs.
 */
function FinderPart({
  finder: { run, from, source, onFind },
  taken,
  onSave,
  styles,
  onPlay,
}: {
  readonly finder: FinderProps;
  readonly taken: ReadonlySet<PositionKey>;
  readonly onSave: (find: Find) => void;
  readonly styles: Styles;
  readonly onPlay: (line: readonly Uci[]) => void;
}) {
  // Each row replays its line: once per run's answer, not per render.
  const found = useMemo(() => run.finds.map((find) => ({ find, row: findRow(find) })), [run.finds]);
  // Each find leads to its own position (the finder keeps one per position), so `next` keys its row.
  const rows = found.filter(({ row: { next } }) => !taken.has(next));
  // Done where it runs from: it found nothing, or an answer failed (the button retries).
  const done = from === 'here' && !run.running;
  const note = !done
    ? undefined
    : run.retry
      ? 'The search stopped short: an engine failed.'
      : found.length
        ? undefined
        : 'No opportunity found from here.';
  return (
    <View>
      <Inline gap="2" align="center" style={[styles.finder, STATIC.finderHead]}>
        <HeadingTip tip={FINDER_TIP}>
          <Eyebrow>{from === 'elsewhere' ? 'From another position' : 'From this position'}</Eyebrow>
        </HeadingTip>
        <SourceChip source={source} />
        {run.running ? (
          <Tip tip={SEARCHING_TIP}>
            <Spinner size="sm" tone="accent" label="Searching for opportunities" />
          </Tip>
        ) : null}
        <View style={STATIC.grow} />
        <IconActions actions={[finderAction(from, run, onFind)]} />
      </Inline>
      {rows.map(({ find, row }) => (
        <Row
          key={row.next}
          row={row}
          styles={styles}
          onPlay={onPlay}
          bookmark={saveAction(find, onSave)}
        />
      ))}
      {note ? (
        <Text role="caption" tone="secondary" style={[styles.finder, STATIC.empty]}>
          {note}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * The finder's button: run it from the board's position, or where it already
 * runs from there and stopped short, try the failed answers again; disabled
 * while it runs or once it is done.
 */
function finderAction(from: FinderProps['from'], run: FinderRun, onFind: () => void): IconAction {
  if (from !== 'here') return { icon: 'search', tip: FIND_TIP, onPress: onFind };
  if (run.retry && !run.running) return { icon: 'refresh', tip: 'Try again', onPress: run.retry };
  return { icon: 'search', tip: FIND_TIP };
}

const FIND_TIP = 'Find opportunities from this position';

const SEARCHING_TIP = 'Searching on this device: the first finds take a few minutes.';

const FINDER_TIP =
  "Looks for the opponent's likely mistakes from the board's position, on this device: Stockfish judges each reply players are likely to make. Each find joins the list once confirmed; the whole search takes a while.";

/** A finder row's bookmark that saves `find`. */
const saveAction = (find: Find, onSave: (find: Find) => void): IconAction => ({
  icon: 'bookmark-outline',
  tip: 'Save this find: the lesson then plays it like its own',
  onPress: () => onSave(find),
});

/** A row's bookmark that forgets the saved find at `cue`. */
const unsaveAction = (cue: PositionKey, onUnsave: (cue: PositionKey) => void): IconAction => ({
  icon: 'bookmark',
  tip: 'Remove from saved',
  onPress: () => onUnsave(cue),
});

/** Names the source of a run's numbers, explained in its tooltip (`sourceChip`). */
function SourceChip({ source }: { readonly source: ReplySource }) {
  const chip = sourceChip(source);
  return (
    <Tip tip={chip.tip}>
      <Badge variant="soft" tone="neutral" size="sm">
        {chip.label}
      </Badge>
    </Tip>
  );
}

/** A source chip's words: whose replies, and what they are (counted games, or Maia's estimate). */
function sourceChip(source: ReplySource) {
  if (source.from === 'lichess') {
    const rated = bandRatings(RATING_BANDS, RATING_BANDS.indexOf(source.band));
    return {
      label: `lichess ${rated}`,
      tip: `Counted: how often lichess players rated ${rated} play each move, from lichess's opening explorer with your account. These rows rank apart from the guide's.`,
    };
  }
  return {
    label: `Maia ${source.rating}`,
    tip: `Estimates: how often players rated about ${source.rating} play each move is Maia ${source.rating}'s guess, not counted games, so these rows rank apart from the guide's. Sign in with lichess to count real games.`,
  };
}

/** What the list ranks, against `players` where counted; each meter's column says what it shows (`COLUMNS`). */
const listTip = (players: string | undefined) =>
  `The opponent's mistakes the guide marks, best first by what knowing each is worth per game${
    players ? ` against ${players}` : ''
  }, or where that isn't measured yet, by how often your games reach it. Tap one to play up to your cue.`;

/** The rows' three meters, left to right: each column's icon, and what it shows in its tooltip. */
const COLUMNS = [
  {
    meter: 'reach',
    icon: 'footsteps-outline',
    tip: 'Reached: how often your games get to the position the mistake is played in. \u2013 means no games counted.',
  },
  {
    meter: 'share',
    icon: 'people-outline',
    tip: 'Played: how often the opponent makes the mistake there. \u2013 means no count for this move.',
  },
  {
    meter: 'payoff',
    icon: 'trophy-outline',
    tip: "Payoff: the winning chances the mistake gives away; # is mate. \u2013 means Stockfish hasn't judged it yet.",
  },
] as const;
type Meter = (typeof COLUMNS)[number]['meter'];

/**
 * An icon over each meter's column (`COLUMNS`), its tooltip saying what the
 * column shows. It sits on the heading's line where both fit, so it adds no
 * line of its own; else it wraps to the next, still ending where a row does.
 * One piece, so the bookmark's room never wraps apart from the icons.
 */
function ColumnHeads({ styles }: { readonly styles: Styles }) {
  return (
    <View style={[STATIC.line, STATIC.grow]}>
      {/* In a row's frame, so the icons sit where its meters do; never shrunk, as a row's meters aren't. */}
      <View style={[styles.frame, STATIC.grow]}>
        <View style={STATIC.grow} />
        <View style={STATIC.meters}>
          {COLUMNS.map(({ meter, icon, tip }) => (
            <Tip key={meter} tip={tip} style={styles.column} focusable>
              <InfoMark name={icon} size={HEADING_INFO_SIZE} />
            </Tip>
          ))}
        </View>
      </View>
      <View style={styles.bookmarkRoom} />
    </View>
  );
}

/** No rows, the same each render. */
const NONE: readonly Opportunity[] = [];

/** The payoff meter's full width: a mistake costing this much of the expected score, or mate. */
const FULL_COST = 0.6;

/** What a row shows, from the lesson's opportunity (`lessonRow`) or a find (`findRow`). */
interface ListRow {
  /** The moves from the start through the mistake, which a press plays. */
  readonly line: readonly Uci[];
  /** The position the mistake leads to: what tells a find from the lesson's rows, since lines transpose. */
  readonly next: PositionKey;
  /** The mistake as the scoresheet names it. */
  readonly san: string;
  readonly name?: string;
  readonly reach?: number;
  readonly share?: number;
  readonly mates: boolean;
  /** The expected score the mistake gives away, where judged. */
  readonly cost?: number;
  readonly mark?: Mark;
  /** What a press plays, for screen readers. */
  readonly hint: string;
}

const lessonRow = (
  { move, san, line, next, reach, share, mates }: Opportunity,
  mark: Mark | undefined,
): ListRow => ({
  line,
  next,
  san,
  name: move.mistake?.name,
  reach,
  share,
  mates,
  cost: move.mistake?.cost,
  mark,
  hint: 'Plays the line up to your cue',
});

/** A find as a row: its line through the mistake, and whether its punishment mates where Act III ends. */
function findRow({
  line,
  mistake,
  replies,
  payoff,
  reach,
  share,
  cost,
}: Pick<Find, 'line' | 'mistake' | 'replies' | 'payoff' | 'reach' | 'share' | 'cost'>): ListRow {
  const through = [...line, mistake];
  const { key, move } = lastStep(through);
  return {
    line: through,
    next: key,
    san: move!.san,
    reach,
    share,
    mates: lastPosition([...through, replies[0], ...payoff]).result?.reason === 'checkmate',
    cost,
    hint: 'Plays the line through the mistake',
  };
}

/**
 * A row: pressing it plays its line. Its bookmark, beside it, saves or
 * forgets the find; every row keeps the bookmark's room, so the meters line
 * up down the list.
 */
function Row({
  row,
  styles,
  onPlay,
  bookmark,
}: {
  readonly row: ListRow;
  readonly styles: Styles;
  readonly onPlay: (line: readonly Uci[]) => void;
  readonly bookmark?: IconAction;
}) {
  const { color } = useTheme().theme.semantic;
  const { san, line, name, reach, share, mates, cost, mark } = row;
  const mistake = numberedMove(san, line.length);
  // Without a name, the two moves before it tell apart one mistake played after several.
  const caption = name ? mistake : leadIn(line);
  // A dash only where unjudged, as each column's tip says; "0%" where judged but it rounds to nothing.
  const payoff = mates
    ? '#'
    : cost === undefined
      ? '–'
      : lostPercent(cost)
        ? `\u2212${percent(cost)}`
        : '0%';
  // Each meter's number and how full its bar is, in its column (`COLUMNS`).
  const meters: Record<Meter, { label: string; fill: number }> = {
    reach: { label: reach === undefined ? '–' : percent(reach), fill: reach ?? 0 },
    share: { label: share === undefined ? '–' : percent(share), fill: share ?? 0 },
    payoff: { label: payoff, fill: mates ? 1 : Math.min((cost ?? 0) / FULL_COST, 1) },
  };
  return (
    <View style={STATIC.line}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[
          name ?? mistake,
          caption,
          reach !== undefined && `reached in ${percent(reach)} of games`,
          share !== undefined && `played ${percent(share)} of the time`,
          mates ? 'punished with mate' : cost !== undefined && `gives away ${percent(cost)}`,
          mark && SPOKEN_MARKS[mark],
        ]
          .filter(Boolean)
          .join(', ')}
        accessibilityHint={row.hint}
        onPress={() => onPlay(line)}
        style={({ pressed }) => [
          styles.frame,
          styles.row,
          STATIC.press,
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
          {COLUMNS.map(({ meter }) => (
            <View key={meter} style={styles.meter}>
              <Text role="caption" tone="secondary" style={STATIC.mono}>
                {meters[meter].label}
              </Text>
              <Progress size="sm" value={meters[meter].fill} max={1} />
            </View>
          ))}
        </View>
      </Pressable>
      <View style={styles.bookmark}>{bookmark ? <Bookmark action={bookmark} /> : null}</View>
    </View>
  );
}

/** A row's bookmark: a small icon button named by its tooltip. */
function Bookmark({ action: { icon, tip, onPress } }: { readonly action: IconAction }) {
  return (
    <Tip tip={tip}>
      <Button
        size="sm"
        variant="ghost"
        onPress={onPress}
        accessibilityLabel={tip}
        style={STATIC.bookmarkButton}
      >
        <Ionicons name={icon} size={17} />
      </Button>
    </Tip>
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
  // The column heads take a line of their own where the panel is too narrow for both.
  headWrap: { flexWrap: 'wrap' },
  finderHead: { paddingTop: 10, paddingBottom: 2 },
  grow: { flexGrow: 1 },
  compact: { gap: 4 },
  empty: { paddingVertical: 8 },
  card: { overflow: 'hidden', paddingVertical: 4 },
  mark: { width: MARK_SIZE, height: MARK_SIZE },
  title: { flexGrow: 1, flexShrink: 1, gap: 1 },
  mono: { fontFamily: fonts.mono },
  meters: { flexDirection: 'row', gap: 6 },
  line: { flexDirection: 'row', alignItems: 'center' },
  press: { flexGrow: 1, flexShrink: 1 },
  // Grown in layout, not by hitSlop, which can't reach past the row on Android (touch.ts).
  bookmarkButton: { minWidth: touchTarget, minHeight: touchTarget },
});

/** The room a row keeps for its bookmark under a mouse; a finger's is `touchTarget` square. */
const BOOKMARK_WIDTH = 34;

/** The card's border: every Silk `Surface` draws 1px, which the rows sit inside of and the heading's line doesn't. */
const CARD_BORDER = 1;

/**
 * A density's sizes: `meter` each meter's width, and `row` a row's own
 * height or padding over the frame (a phone's rows are 44 tall under a mouse;
 * under a finger the bookmark's room makes them `touchTarget` tall).
 * `inset` is the rows' side padding, and `bookmarkInset` keeps the bookmark
 * off the card's edge, which `edge` (the card's border, if any) draws.
 */
function densityStyles(
  meter: number,
  row: ViewStyle,
  { inset, bookmarkInset, edge }: { inset: number; bookmarkInset: number; edge: number },
) {
  const bookmarkWidth = { width: BOOKMARK_WIDTH, minWidth: touchTarget };
  return StyleSheet.create({
    // A row's line across, which the column heads share; `row` sizes it down.
    frame: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: inset },
    row: { outlineOffset: -2, ...row },
    meter: { width: meter, gap: 3 },
    finder: { paddingHorizontal: inset },
    // Even where empty, so every row keeps the same room and height as one with a bookmark.
    bookmark: { ...bookmarkWidth, minHeight: touchTarget, marginRight: bookmarkInset },
    // The bookmark's room after the column heads (`ColumnHeads`), which sit outside the card.
    bookmarkRoom: { ...bookmarkWidth, marginRight: bookmarkInset + edge },
    // Flush left, as its numbers and bars are.
    column: { width: meter, alignItems: 'flex-start' },
  });
}
type Styles = ReturnType<typeof densityStyles>;

// A phone's rows run to the page's edge; a card's keep inside it.
const COMPACT = densityStyles(32, { minHeight: 44 }, { inset: 0, bookmarkInset: 0, edge: 0 });
const COMFORTABLE = densityStyles(
  44,
  { paddingVertical: 8 },
  { inset: 14, bookmarkInset: 6, edge: CARD_BORDER },
);
