import { a11yState, Pressable, Stack, Surface, Text, useTheme } from '@reactive/silk-native';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Text as Span, StyleSheet, View } from 'react-native';

import { evaluationReading, signedEvaluation } from '@/evaluation/evaluation';
import { candidateTone } from '@/lesson/drawings';
import type { Uci } from '@/lesson/lesson';
import type { Candidate } from '@/lesson/select';
import { hovers } from '@/board/pointer';
import { Eyebrow, labelled } from '@/components/Eyebrow';
import { QualityBadge } from '@/components/QualityBadge';
import type { Mark } from '@/progress/progress';
import { NARROW_CSS_LOADS, narrowPart } from '@/theme/narrow';
import { fonts } from '@/theme/theme';
import { toneColors } from '@/theme/drawingTones';

import { MARK_SIZE, MarkLegend, ProgressMark, SPOKEN_MARKS } from './ProgressMark';

interface Props {
  /** The list's heading: what moves these are, and whose unless `owner` says. */
  readonly heading: string;
  /** Whose moves these are, before `heading`; only spoken in a narrow web page's pane, where it would wrap. */
  readonly owner?: string;
  readonly candidates: readonly Candidate[];
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
   * On a narrow web page, where the list has a narrow pane, its rows leave
   * out where they lead: a line under the list names that for the move
   * pointed at. Leave it off where the list is about where each move leads.
   */
  readonly compact?: boolean;
}

/**
 * The guide's moves at the position on the board, one row each, most played
 * first, or past them Stockfish's top moves, best first, each with the
 * evaluation after it in place of its share. Pointing at a row previews its
 * move on the board; pressing it plays the move when it's the learner's to
 * play. Each row's dot matches its arrow on the board; the dot of a row the
 * board draws no arrow for is hollow: a rare row's, or one of Stockfish's
 * but its best. A row's progress mark ends it, and a key beside the heading
 * names the marks the list shows (not in a narrow web page's pane).
 */
export function CandidateList({
  heading,
  owner,
  candidates,
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
  const rows = rareShown ? all : candidates;
  const shownMarks = new Set(
    rows.map(({ move }) => marks.get(move.uci)).filter((mark) => mark !== undefined),
  );
  // A drag can point at a rare candidate while its row is hidden.
  const pointedRow = all.find(({ move }) => move.uci === pointed);
  const caption = compact && NARROW_CSS_LOADS && pointedRow && leadsTo(pointedRow);
  return (
    <Stack {...narrowPart('move-list')} style={labelled}>
      <View style={styles.head}>
        <Eyebrow>
          {/* A plain Text takes the eyebrow's style; Silk's would set its own. */}
          {owner ? <Span {...narrowPart('wide-only-spoken')}>{`${owner}'s `}</Span> : null}
          {heading}
        </Eyebrow>
        {/* A narrow pane has no room for the key: each mark's row still says it to screen readers. */}
        <View {...narrowPart('wide-only')}>
          <MarkLegend marks={shownMarks} />
        </View>
      </View>
      <Surface
        {...narrowPart('list-card')}
        elevation="sunken"
        border="subtle"
        radius="md"
        style={styles.list}
      >
        {/* On a narrow web page the rows scroll inside the card, under its heading. */}
        <View {...narrowPart('list-scroll')}>
          {rows.map((candidate, index) => (
            <Row
              key={candidate.move.uci}
              candidate={candidate}
              main={candidate === main}
              pointed={candidate.move.uci === pointed}
              mark={marks.get(candidate.move.uci)}
              // Every row keeps room for a mark once one has one, so their shares line up.
              markSlot={shownMarks.size > 0}
              leadsTo={leadsTo(candidate)}
              compact={compact}
              // A lone move's share is always all of the games.
              share={rows.length > 1 ? candidate.share : undefined}
              playable={playable}
              onPlay={onPlay}
              onPoint={onPoint}
              onTabOut={!rare.length && index === rows.length - 1 ? onTabOut : undefined}
            />
          ))}
          {rare.length ? (
            <RareToggle
              count={rare.length}
              shown={rareShown}
              onToggle={() => onShowRare(!rareShown)}
              onTabOut={onTabOut}
            />
          ) : null}
        </View>
      </Surface>
      {caption ? (
        <Text {...narrowPart('narrow-only')} role="caption" tone="secondary">
          {`${pointedRow.san}: ${caption}`}
        </Text>
      ) : null}
    </Stack>
  );
}

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
  // Never singular: a list hides rare rows only when at least FEWEST_RARE are rare.
  const label = shown ? 'Hide rarer replies' : `Show ${count} rarer replies`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      {...a11yState({ expanded: shown })}
      onPress={onToggle}
      onKeyDown={tabOut(onTabOut)}
      {...narrowPart('candidate-row')}
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
  readonly pointed: boolean;
  readonly mark?: Mark;
  /** Some row of the list has a mark, so this one keeps room for one. */
  readonly markSlot: boolean;
  readonly leadsTo?: string;
  /** As the list's `compact`. */
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
  const { color } = theme.semantic;
  const { move, san, engine } = candidate;
  const tone = toneColors[candidateTone(candidate, main)];
  const hollow = candidate.rare || (engine && !main);
  const point = () => onPoint(move.uci);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[
        san,
        move.book && 'book move',
        share !== undefined && `${percent(share)} of games`,
        engine && evaluationReading(engine).description,
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
      {...narrowPart('candidate-row')}
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
          {move.risk ? (
            <Text role="caption" tone="secondary" style={styles.risk}>
              {move.risk}
            </Text>
          ) : null}
        </View>
        {leadsTo ? (
          <Text
            {...narrowPart(compact ? 'wide-only' : 'leads-to')}
            role="caption"
            tone="secondary"
            numberOfLines={1}
          >
            {leadsTo}
          </Text>
        ) : null}
      </View>
      {engine ? (
        <Text role="caption" tone="secondary" style={styles.evaluation}>
          {signedEvaluation(engine)}
        </Text>
      ) : null}
      {share === undefined ? null : (
        <View style={styles.share}>
          <View
            {...narrowPart('share-track')}
            style={[styles.track, { backgroundColor: color.tones.neutral.subtle }]}
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

/** The book badge, as in the scoresheet, about the height of the notation's capitals. */
const BOOK_BADGE_SIZE = 16;

const percent = (share: number) => `${Math.round(share * 100)}%`;

const ROW_INSET = 14;
const ROW_GAP = 12;
const DOT_SIZE = 10;

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    columnGap: 16,
    rowGap: 6,
  },
  list: { overflow: 'hidden', paddingVertical: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ROW_GAP,
    paddingHorizontal: ROW_INSET,
    paddingVertical: 8,
    outlineOffset: -2,
  },
  dot: { width: DOT_SIZE, height: DOT_SIZE, borderRadius: DOT_SIZE / 2 },
  // Text lines up with the rows' moves, past the dot and its gap.
  toggle: { paddingLeft: ROW_INSET + DOT_SIZE + ROW_GAP },
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
});
