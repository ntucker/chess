import Ionicons from '@expo/vector-icons/Ionicons';
import {
  a11yState,
  Pressable,
  Stack,
  Surface,
  Text,
  Tooltip,
  useTheme,
} from '@reactive/silk-native';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { candidateTone } from '@/lesson/drawings';
import type { PositionKey, Uci } from '@/lesson/lesson';
import type { Candidate } from '@/lesson/select';
import { hovers } from '@/board/pointer';
import { Eyebrow, useLabelled } from '@/components/Eyebrow';
import { QualityBadge } from '@/components/QualityBadge';
import type { Mark } from '@/progress/progress';
import { narrowLength, narrowStyles, visuallyHidden } from '@/theme/narrow';
import { NarrowScroll, useNarrowPart, useNarrowStyles } from '@/theme/Narrow';
import { fonts } from '@/theme/theme';
import { toneColors } from '@/theme/drawingTones';
import { MotionList, MotionView } from '@/motion/MotionList';

import { MARK_SIZE, MarkLegend, ProgressMark, SPOKEN_MARKS } from './ProgressMark';

interface Props {
  /** The list's heading: what moves these are, and whose unless `owner` says. */
  readonly heading: string;
  /** Whose games the rows' shares count (`shareSource`), said in a tooltip on the heading. */
  readonly shareTip?: string;
  /** Whose moves these are, before `heading`; only spoken in a narrow page's pane, where it would wrap. */
  readonly owner?: string;
  /** The position whose moves these are: another position's moves are another list */
  readonly position: PositionKey;
  readonly candidates: readonly Candidate[];
  /**
   * Stockfish's best move, listed after the guide's candidates and marked as
   * the top engine move, for when the guide doesn't list it.
   */
  readonly engineBest?: Candidate;
  /** Rare candidates, listed after the others while `rareShown`. */
  readonly rare: readonly Candidate[];
  readonly rareShown: boolean;
  /** The learner shows or hides the rare rows. */
  readonly onShowRare: (shown: boolean) => void;
  /** The candidate the board draws as the main one (see `candidateDrawings`). */
  readonly main?: Candidate;
  /** The row previewed, whether its row is pointed at or its piece dragged onto its square. */
  readonly pointed?: Uci;
  /** Each row's progress mark, by its move (`rowMarks`). */
  readonly marks: ReadonlyMap<Uci, Mark>;
  /** Where each move leads, when it enters another variation. */
  readonly leadsTo: (candidate: Candidate) => string | undefined;
  /** The rows are the learner's to play now; otherwise they only preview. */
  readonly playable: boolean;
  readonly onPlay: (candidate: Candidate) => void;
  /**
   * The learner points at a row: the mouse moves over it, keyboard focus
   * lands on it, or a finger holds it (or taps it, when it isn't playable).
   * `time` is when, for the mouse (see `PeekAction`).
   */
  readonly onPoint: (uci: Uci, time?: number) => void;
  /**
   * Keyboard focus moves on past the list. The preview ends first, so the
   * idea card focus lands in shows the position's own notes.
   */
  readonly onTabOut: () => void;
  /**
   * On a narrow page, where the list has a narrow pane, its rows leave
   * out where they lead: a line under the list names that for the move
   * pointed at. Leave it off where the list is about where each move leads.
   */
  readonly compact?: boolean;
}

/**
 * A list of moves at the position on the board, one row each, in one of two
 * kinds:
 * - The guide's moves, most played first, each with its share of the games.
 *   Stockfish's best follows them when the guide lacks it (`engineBest`),
 *   with a star whose tooltip says it is the top engine move. Rare rows come
 *   after it, when the learner asks for them.
 * - Past the guide's moves, Stockfish's top moves, best first, each with how
 *   it changes the position for the learner in place of a share.
 *
 * Pointing at a row previews its move on the board; pressing it plays the
 * move when it's the learner's to play. Each row's dot matches its arrow on
 * the board; the dot of a row the board draws no arrow for is hollow: a rare
 * row's, or one of Stockfish's top moves but its best. A row's progress mark
 * ends it, and a key beside the heading names the marks the list shows (not
 * in a narrow web page's pane).
 */
export function CandidateList({
  heading,
  shareTip,
  owner,
  position,
  candidates,
  engineBest,
  rare,
  rareShown,
  onShowRare,
  main,
  pointed,
  marks,
  leadsTo,
  playable,
  onPlay,
  onPoint,
  onTabOut,
  compact,
}: Props) {
  const all = [...candidates, ...rare];
  const engineRows = engineBest ? [engineBest] : [];
  const rows = [...candidates, ...engineRows, ...(rareShown ? rare : [])];
  // The guide's rows shown, whose shares are of each other's games.
  const guideCount = candidates.length + (rareShown ? rare.length : 0);
  // A lone move's share is always all of the games, so it isn't shown.
  const showsShares = guideCount > 1 && rows.some(({ share }) => share !== undefined);
  const shownMarks = new Set(
    rows.map(({ move }) => marks.get(move.uci)).filter((mark) => mark !== undefined),
  );
  // A drag can point at a rare candidate while its row is hidden.
  const pointedRow = [...all, ...engineRows].find(({ move }) => move.uci === pointed);
  const caption = compact && pointedRow && leadsTo(pointedRow);
  const labelled = useLabelled();
  const styles = useNarrowStyles(STYLES);
  const part = useNarrowPart();
  return (
    <Stack {...part('move-list', labelled)}>
      <View style={styles.head}>
        {/*
         * Whose moves is an eyebrow of its own: off the web a nested text can't be hidden.
         * Its no-break space keeps the gap a space would leave inside one text.
         */}
        <ShareTip tip={showsShares ? shareTip : undefined}>
          <View style={styles.heading}>
            {owner ? (
              <View {...part('wide-only-spoken')}>
                <Eyebrow>{`${owner}'s\u00a0`}</Eyebrow>
              </View>
            ) : null}
            <Eyebrow>{heading}</Eyebrow>
          </View>
        </ShareTip>
        {/* A narrow pane has no room for the key: each mark's row still says it to screen readers. */}
        <View {...part('wide-only')}>
          <MarkLegend marks={shownMarks} />
        </View>
      </View>
      <Surface elevation="sunken" border="subtle" radius="md" {...part('list-card', styles.list)}>
        {/* On a narrow page the rows scroll inside the card, under its heading. */}
        <NarrowScroll part="list-scroll">
          {/*
           * Showing or hiding the rare rows slides the rows below and fades them in or out.
           * Another position's moves are another list, so leaving one with its rare rows shown
           * swaps the rows at once instead of fading them, while rows reordered in one position
           * (a deeper search re-ranking Stockfish's) still glide.
           */}
          <MotionList key={position} layoutDependency={rareShown}>
            {rows.map((candidate, index) => (
              <MotionView key={candidate.move.uci} id={candidate.move.uci}>
                <Row
                  candidate={candidate}
                  main={candidate === main}
                  topEngine={candidate === engineBest}
                  pointed={candidate.move.uci === pointed}
                  mark={marks.get(candidate.move.uci)}
                  // Every row keeps room for a mark once one has one, so their shares line up.
                  markSlot={shownMarks.size > 0}
                  leadsTo={leadsTo(candidate)}
                  compact={compact}
                  share={showsShares ? candidate.share : undefined}
                  playable={playable}
                  onPlay={onPlay}
                  onPoint={onPoint}
                  onTabOut={!rare.length && index === rows.length - 1 ? onTabOut : undefined}
                />
              </MotionView>
            ))}
            {rare.length ? (
              <MotionView id={RARE_TOGGLE}>
                <RareToggle
                  count={rare.length}
                  shown={rareShown}
                  onToggle={() => onShowRare(!rareShown)}
                  onTabOut={onTabOut}
                />
              </MotionView>
            ) : null}
          </MotionList>
        </NarrowScroll>
      </Surface>
      {caption ? (
        <Text role="caption" tone="secondary" {...part('narrow-only')}>
          {`${pointedRow.san}: ${caption}`}
        </Text>
      ) : null}
    </Stack>
  );
}

/** The rare toggle's key among the rows' moves. */
const RARE_TOGGLE = 'rare-toggle';

/** The last row of a list with rare candidates: shows or hides them. */
function RareToggle({
  count,
  shown,
  onToggle,
  onTabOut,
}: {
  readonly count: number;
  readonly shown: boolean;
  readonly onToggle: () => void;
  readonly onTabOut: () => void;
}) {
  const { theme } = useTheme();
  const styles = useNarrowStyles(STYLES);
  // Never singular: a list hides rare rows only when at least FEWEST_RARE are rare.
  const label = shown ? 'Hide rarer replies' : `Show ${count} rarer replies`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      {...a11yState({ expanded: shown })}
      onPress={onToggle}
      onKeyDown={tabOut(onTabOut)}
      style={({ hovered, pressed }) => [
        styles.row,
        styles.toggle,
        (hovered || pressed) && { backgroundColor: theme.semantic.color.tones.neutral.subtle },
      ]}
    >
      <Text role="caption" tone="secondary">
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * A key handler calling `onTabOut` on a forward Tab, before the browser moves
 * focus, so it lands among the notes shown next.
 */
const tabOut = (onTabOut?: () => void) => (event: unknown) => {
  const { key, shiftKey } = event as ReactKeyboardEvent;
  if (key === 'Tab' && !shiftKey) onTabOut?.();
};

interface RowProps {
  readonly candidate: Candidate;
  readonly main: boolean;
  /** One of Stockfish's moves listed after the guide's: marked as its top move. */
  readonly topEngine: boolean;
  readonly pointed: boolean;
  readonly mark?: Mark;
  /** Some row of the list has a mark, so this one keeps room for one. */
  readonly markSlot: boolean;
  readonly leadsTo?: string;
  /** As the list's `compact`: a narrow page leaves out where the row leads. */
  readonly compact?: boolean;
  /** The move's share of the games, when worth showing. */
  readonly share?: number;
  readonly playable: boolean;
  readonly onPlay: (candidate: Candidate) => void;
  /** As the list's `onPoint`. */
  readonly onPoint: (uci: Uci, time?: number) => void;
  /** Tab (forward) leaves this row for whatever follows the list. */
  readonly onTabOut?: () => void;
}

function Row({
  candidate,
  main,
  topEngine,
  pointed,
  mark,
  markSlot,
  leadsTo,
  compact,
  share,
  playable,
  onPlay,
  onPoint,
  onTabOut,
}: RowProps) {
  const { theme } = useTheme();
  const styles = useNarrowStyles(STYLES);
  const part = useNarrowPart();
  const { color } = theme.semantic;
  const { move, san, engine } = candidate;
  const tone = toneColors[candidateTone(candidate, main)];
  // The board marks Stockfish's best, the top move listed beside the guide's.
  const hollow = candidate.rare || (engine && !main && !topEngine);
  const point = () => onPoint(move.uci);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[
        san,
        move.book && 'book move',
        share !== undefined && `${percent(share)} of games`,
        topEngine ? TOP_ENGINE_MOVE : engine?.description,
        mark && SPOKEN_MARKS[mark],
      ]
        .filter(Boolean)
        .join(', ')}
      accessibilityHint={playable ? 'Plays this move' : undefined}
      // Not disabled: the opponent's rows still preview while not playable.
      accessibilityState={{ disabled: !playable }}
      onPress={playable ? () => onPlay(candidate) : point}
      onLongPress={point}
      // On the first move, replacing the preview before mid-slide. A move, not
      // an enter: a list that changes under a still mouse previews nothing
      // until the mouse moves. Leaving keeps the preview (the screen ends it),
      // so the learner can go on to its notes; a row crossed on the way there,
      // for less than `HOLD_MS`, gives the card back to the row held before.
      onPointerMove={({ nativeEvent, timeStamp }) => {
        if (!pointed && hovers(nativeEvent.pointerType)) onPoint(move.uci, timeStamp);
      }}
      onKeyDown={tabOut(onTabOut)}
      onFocus={point}
      style={({ pressed }) => [
        styles.row,
        (pointed || (pressed && playable)) && {
          backgroundColor: color.tones.neutral.subtle,
        },
      ]}
    >
      <View
        style={[
          styles.dot,
          hollow ? { borderWidth: 2, borderColor: tone } : { backgroundColor: tone },
        ]}
      />
      <View style={styles.move}>
        <View style={styles.title}>
          <Text role="body" style={styles.san}>
            {san}
          </Text>
          {move.book ? <QualityBadge quality="book" size={BOOK_BADGE_SIZE} /> : null}
          {topEngine ? (
            // The badge says what it means on a resting mouse or a tap; the row's label says it aloud.
            <Tooltip.Root>
              <Tooltip.Trigger>
                <QualityBadge quality="best" size={BOOK_BADGE_SIZE} />
              </Tooltip.Trigger>
              <Tooltip.Content>{TOP_ENGINE_TIP}</Tooltip.Content>
            </Tooltip.Root>
          ) : null}
          {move.risk ? (
            <Text role="caption" tone="secondary" style={styles.risk}>
              {move.risk}
            </Text>
          ) : null}
        </View>
        {leadsTo ? (
          <Text role="caption" tone="secondary" numberOfLines={1} {...part(compact && 'wide-only')}>
            {leadsTo}
          </Text>
        ) : null}
      </View>
      {engine && !topEngine ? (
        <Text role="caption" tone="secondary" style={styles.evaluation}>
          {engine.label}
        </Text>
      ) : null}
      {share === undefined ? null : (
        <View style={styles.share}>
          {/* A narrow pane has no room for the bar. */}
          <View
            {...part('wide-only', [styles.track, { backgroundColor: color.tones.neutral.subtle }])}
          >
            <View style={[styles.fillBar, { width: `${share * 100}%`, backgroundColor: tone }]} />
          </View>
          <Text role="caption" tone="secondary" style={styles.percent}>
            {percent(share)}
          </Text>
        </View>
      )}
      {markSlot ? (
        <View style={styles.mark}>{mark ? <ProgressMark mark={mark} /> : null}</View>
      ) : null}
    </Pressable>
  );
}

/** What a row of Stockfish's among the guide's says it is. */
const TOP_ENGINE_MOVE = 'top engine move';
const TOP_ENGINE_TIP = "Top engine move: Stockfish's best reply here, not one the guide teaches.";

/** The book badge, as in the scoresheet, about the height of the notation's capitals. */
const BOOK_BADGE_SIZE = 16;

/** The info mark beside the heading, about as tall as the eyebrow's capitals. */
const INFO_SIZE = 13;

/**
 * The list's heading, with a mark that a tap or a resting mouse says whose
 * games the percentages count, when they show: the words stay out of the
 * panel until asked for. Screen readers read them after the heading.
 */
function ShareTip({ tip, children }: { readonly tip?: string; readonly children: ReactNode }) {
  const { theme } = useTheme();
  if (!tip) return children;
  return (
    <Tooltip.Root>
      <Tooltip.Trigger style={STATIC.tipped}>
        {children}
        <Ionicons
          name="information-circle-outline"
          size={INFO_SIZE}
          color={theme.semantic.color.textSecondary}
        />
        <Text style={STATIC.spoken}>{tip}</Text>
      </Tooltip.Trigger>
      <Tooltip.Content>{tip}</Tooltip.Content>
    </Tooltip.Root>
  );
}

const STATIC = StyleSheet.create({
  // The mark beside the heading's last word, as wide as it needs.
  tipped: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  // Out of sight and out of layout, but read.
  spoken: { ...visuallyHidden, opacity: 0 },
});

const percent = (share: number) => `${Math.round(share * 100)}%`;

/** A row's spacing, more compact in a narrow pane. */
const ROW_INSET = narrowLength('candidate-inset', 14);
const ROW_GAP = narrowLength('candidate-gap', 12);
const ROW_PADDING = narrowLength('candidate-padding', 8);
const DOT_SIZE = 10;

const STYLES = narrowStyles((px) => ({
  head: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    columnGap: 16,
    rowGap: 6,
  },
  heading: { flexDirection: 'row', flexWrap: 'wrap', flexShrink: 1 },
  list: { overflow: 'hidden', paddingVertical: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: px(ROW_GAP),
    paddingHorizontal: px(ROW_INSET),
    paddingVertical: px(ROW_PADDING),
    outlineOffset: -2,
  },
  dot: { width: DOT_SIZE, height: DOT_SIZE, borderRadius: DOT_SIZE / 2 },
  // Text lines up with the rows' moves, past the dot and its gap.
  toggle: { paddingLeft: px(ROW_INSET.plus(DOT_SIZE).plus(ROW_GAP)) },
  move: { flex: 1, gap: 1 },
  title: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  san: { fontFamily: fonts.mono, fontSize: 17 },
  risk: { textTransform: 'capitalize' },
  share: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  track: { width: 52, height: 4, borderRadius: 2, overflow: 'hidden' },
  fillBar: { height: '100%', borderRadius: 2 },
  percent: { width: 32, textAlign: 'right', fontFamily: fonts.mono },
  evaluation: { minWidth: 44, textAlign: 'right', fontFamily: fonts.mono },
  mark: { width: MARK_SIZE, height: MARK_SIZE },
}));
