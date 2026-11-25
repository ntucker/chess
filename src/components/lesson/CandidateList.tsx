import {
  a11yState,
  MotionList,
  MotionView,
  Pressable,
  Stack,
  Surface,
  Text,
  useTheme,
} from '@reactive/silk-native';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { candidateTone } from '@/lesson/drawings';
import type { PositionKey, Uci } from '@/lesson/lesson';
import type { Candidate } from '@/lesson/select';
import { hovers } from '@/board/pointer';
import { Eyebrow, useLabelled } from '@/components/Eyebrow';
import { Notation } from '@/components/Notation';
import { type EngineVerdict, percent } from '@/analysis/quality';
import { QualityBadge, TippedBadge, verdictText } from '@/components/QualityBadge';
import { InfoMark, Tip } from '@/components/Tip';
import type { Mark } from '@/progress/progress';
import { NARROW_CSS_LOADS, spokenOnly } from '@/theme/narrow';
import type { Density } from '@/theme/Narrow';
import { fonts } from '@/theme/theme';
import { toneColors } from '@/theme/drawingTones';

import { MARK_SIZE, MarkLegend, ProgressMark, SPOKEN_MARKS } from './ProgressMark';

interface Props {
  /** The list's heading: what moves these are, and whose unless `owner` says. */
  readonly heading: string;
  /** Whose games the rows' shares count (`shareSource`), said in a tooltip on the heading, or compact on each share. */
  readonly shareTip?: string;
  /** Whose moves these are, before `heading`. */
  readonly owner?: string;
  /** The position whose moves these are: another position's moves are another list */
  readonly position: PositionKey;
  readonly candidates: readonly Candidate[];
  /**
   * Stockfish's best move, listed after the guide's candidates and marked as
   * the top engine move, for when the guide doesn't list it.
   */
  readonly engineBest?: Candidate;
  /**
   * Stockfish's verdict on each guide candidate, by move: a badge after its
   * move, whose tooltip says the verdict and the change for the learner.
   */
  readonly verdicts?: ReadonlyMap<Uci, EngineVerdict>;
  /**
   * Point out the other side's marked mistakes (`Guidance.opportunities`):
   * each row's dot in the danger tone, and its cost once Stockfish judged it.
   */
  readonly opportunities?: boolean;
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
   * Each row says where it leads at any density. A compact list's rows
   * otherwise leave it to the idea card, which names it for the row pointed
   * at: set it where nothing does, or where the list is about where each
   * move leads.
   */
  readonly leadsAlways: boolean;
  /**
   * `compact`, a phone's pane: the rows alone, each on a short line, which
   * the layout scrolls. `comfortable`, a wide panel: a heading with a key to
   * the marks, over the rows on a card, each with its share drawn as a bar.
   */
  readonly density: Density;
}

/**
 * A list of moves at the position on the board, one row each, in one of two
 * kinds:
 * - The guide's moves, most played first, each with its share of the games
 *   and Stockfish's verdict on it (`verdicts`) once it has one.
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
 * ends it, and a comfortable list's key beside the heading names the marks
 * it shows (a compact one's rows still say theirs to screen readers).
 */
export function CandidateList({
  heading,
  shareTip,
  owner,
  position,
  candidates,
  engineBest,
  verdicts,
  opportunities = false,
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
  leadsAlways,
  density,
}: Props) {
  const engineRows = engineBest ? [engineBest] : [];
  const rows = [...candidates, ...engineRows, ...(rareShown ? rare : [])];
  // The guide's rows shown, whose shares are of the games at the position.
  const guideCount = candidates.length + (rareShown ? rare.length : 0);
  // Shares show only when the guide offers a choice: more than one of its rows.
  const showsShares = guideCount > 1 && rows.some(({ share }) => share !== undefined);
  const shownMarks = new Set(
    rows.map(({ move }) => marks.get(move.uci)).filter((mark) => mark !== undefined),
  );
  const compact = density === 'compact';
  const styles = compact ? COMPACT : COMFORTABLE;
  const labelled = useLabelled();
  const shares = showsShares ? shareTip : undefined;
  // Showing or hiding the rare rows slides the rows below and fades them in or out.
  // Another position's moves are another list, so leaving one with its rare rows shown
  // swaps the rows at once instead of fading them, while rows reordered in one position
  // (a deeper search re-ranking Stockfish's) still glide.
  const list = (
    <MotionList key={position} layoutDependency={rareShown}>
      {rows.map((candidate, index) => (
        <MotionView key={candidate.move.uci} id={candidate.move.uci}>
          <Row
            candidate={candidate}
            main={candidate === main}
            topEngine={candidate === engineBest}
            verdict={verdicts?.get(candidate.move.uci)}
            opportunities={opportunities}
            pointed={candidate.move.uci === pointed}
            mark={marks.get(candidate.move.uci)}
            // Every row keeps room for a mark once one has one, so their shares line up.
            markSlot={shownMarks.size > 0}
            leadsTo={compact && !leadsAlways ? undefined : leadsTo(candidate)}
            styles={styles}
            share={showsShares ? candidate.share : undefined}
            // Once, on the top share: every row's would repeat it to screen readers.
            shareTip={compact && index === 0 ? shares : undefined}
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
            styles={styles}
            count={rare.length}
            shown={rareShown}
            onToggle={() => onShowRare(!rareShown)}
            onTabOut={onTabOut}
          />
        </MotionView>
      ) : null}
    </MotionList>
  );
  const title = owner ? `${owner}'s ${heading}` : heading;
  if (compact) {
    return (
      <View>
        {/* No room to show it, but screen readers still hear whose moves these are. */}
        <Text style={spokenOnly}>{title}</Text>
        {list}
      </View>
    );
  }
  return (
    <Stack style={labelled}>
      <View style={styles.head}>
        <ShareTip tip={shares} marked>
          <Eyebrow>{title}</Eyebrow>
        </ShareTip>
        <MarkLegend marks={shownMarks} />
      </View>
      <Surface elevation="sunken" border="subtle" radius="md" style={styles.list}>
        {list}
      </Surface>
    </Stack>
  );
}

/** The rare toggle's key among the rows' moves. */
const RARE_TOGGLE = 'rare-toggle';

/** The last row of a list with rare candidates: shows or hides them. */
function RareToggle({
  styles,
  count,
  shown,
  onToggle,
  onTabOut,
}: {
  readonly styles: Styles;
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
      style={({ hovered, pressed }) => [
        styles.row,
        styles.toggle,
        (hovered || pressed) && { backgroundColor: theme.semantic.color.tones.neutral.subtle },
      ]}
    >
      <Text role="caption" tone="secondary">
        {styles.compact ? (shown ? 'Fewer' : `+${count} more`) : label}
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
  /** Stockfish's verdict on a guide's move. */
  readonly verdict?: EngineVerdict;
  /** As the list's. */
  readonly opportunities: boolean;
  readonly pointed: boolean;
  readonly mark?: Mark;
  /** Some row of the list has a mark, so this one keeps room for one. */
  readonly markSlot: boolean;
  readonly leadsTo?: string;
  /** The list's density's styles. */
  readonly styles: Styles;
  /** The move's share of the games, when worth showing. */
  readonly share?: number;
  /** Whose games the share counts, in a tooltip on it. */
  readonly shareTip?: string;
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
  verdict,
  opportunities,
  pointed,
  mark,
  markSlot,
  leadsTo,
  styles,
  share,
  shareTip,
  playable,
  onPlay,
  onPoint,
  onTabOut,
}: RowProps) {
  const { theme } = useTheme();
  const { color } = theme.semantic;
  const { move, san, engine } = candidate;
  const tone = toneColors[candidateTone(candidate, main, opportunities)];
  // The other side's marked mistake: what it gives away, once Stockfish judged it.
  const cost = opportunities && move.mistake ? verdict?.loss : undefined;
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
        verdict && verdictText(verdict),
        cost !== undefined && costTip(cost),
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
          <Text role="body" style={styles.san} {...SHRINK_TO_LINE}>
            <Notation>{san}</Notation>
          </Text>
          {move.book ? <QualityBadge quality="book" size={styles.badgeSize} /> : null}
          {/* Each badge says what it means on a resting mouse or a tap; the row's label says it aloud. */}
          {topEngine ? (
            <TippedBadge quality="best" size={styles.badgeSize} tip={TOP_ENGINE_TIP} />
          ) : null}
          {verdict ? (
            <TippedBadge
              quality={verdict.quality}
              size={styles.badgeSize}
              tip={verdictText(verdict)}
            />
          ) : null}
          {cost === undefined ? null : (
            <Tip tip={costTip(cost)}>
              <Text role="caption" tone="danger" style={styles.cost}>
                {`\u2212${percent(cost)}`}
              </Text>
            </Tip>
          )}
          {move.risk ? (
            <Text role="caption" tone="secondary" style={styles.risk}>
              {move.risk}
            </Text>
          ) : null}
        </View>
        {leadsTo ? (
          <Text role="caption" tone="secondary" numberOfLines={1}>
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
          {/* A compact row has no room for the bar. */}
          {styles.compact ? null : (
            <View style={[styles.track, { backgroundColor: color.tones.neutral.subtle }]}>
              <View style={[styles.fillBar, { width: `${share * 100}%`, backgroundColor: tone }]} />
            </View>
          )}
          <ShareTip tip={shareTip}>
            <Text role="caption" tone="secondary" style={styles.percent}>
              {percent(share)}
            </Text>
          </ShareTip>
        </View>
      )}
      {markSlot ? (
        <View style={styles.mark}>{mark ? <ProgressMark mark={mark} /> : null}</View>
      ) : null}
    </Pressable>
  );
}

/** What an opportunity's cost means, in its tooltip and its row's label. */
const costTip = (loss: number) =>
  `An opportunity: this mistake gives away ${percent(loss)} of the winning chances`;

/** What a row of Stockfish's among the guide's says it is. */
const TOP_ENGINE_MOVE = 'top engine move';
const TOP_ENGINE_TIP = "Top engine move: Stockfish's best reply here, not one the guide teaches.";

/** The info mark beside the heading, about as tall as the eyebrow's capitals. */
const INFO_SIZE = 13;

/**
 * `children`, which a tap or a resting mouse makes say whose games the
 * shares count, when they show: the words stay out of the panel until asked
 * for. On a heading (`marked`), a mark beside it hints at that. Screen
 * readers read the words after `children`.
 */
function ShareTip({
  tip,
  marked,
  children,
}: {
  readonly tip?: string;
  readonly marked?: boolean;
  readonly children: ReactNode;
}) {
  if (!tip) return children;
  return (
    <Tip tip={tip} style={STATIC.tipped}>
      {children}
      {marked ? <InfoMark size={INFO_SIZE} /> : null}
    </Tip>
  );
}

const STATIC = StyleSheet.create({
  // The mark beside the heading's last word, as wide as it needs.
  tipped: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
});

/** A share's least width, which holds 100% in caption text: larger text widens it. */
const SHARE_WIDTH = 32;
/** An evaluation's least width, which holds its longest label (as −9.9 or −M12) in caption text. */
const EVALUATION_WIDTH = 44;

/**
 * A move on one line, whose text shrinks when its row has too little room
 * for it, rather than push its badge over the share. Off the web only: the
 * web's text doesn't scale with the system's, so its rows have room.
 */
const SHRINK_TO_LINE = NARROW_CSS_LOADS
  ? {}
  : ({ numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.55 } as const);

/** Space between a row's move and its badge. */
const TITLE_GAP = 8;

/** What sizes a density's rows. */
interface Metrics {
  /** Space at each end of a row, and between its parts. */
  readonly inset: number;
  readonly gap: number;
  readonly dot: number;
  /** The notation's size. */
  readonly san: number;
  /** A badge's size (the book's, Stockfish's), about the height of the notation's capitals. */
  readonly badge: number;
  readonly row: ViewStyle;
}

/** A density's styles, from its row's sizes, with its badges' size, which they take as a number. */
function rowStyles({ inset, gap, dot, san, badge, row }: Metrics, compact: boolean) {
  const sheet = StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap,
      paddingHorizontal: inset,
      outlineOffset: -2,
      ...row,
    },
    dot: { width: dot, height: dot, borderRadius: dot / 2 },
    // Text lines up with the rows' moves, past the dot and its gap.
    toggle: { paddingLeft: inset + dot + gap },
    // Off the web, too long a move shrinks to its line (`SHRINK_TO_LINE`) rather than push its badge over the share.
    san: { fontFamily: fonts.mono, fontSize: san, flexShrink: 1 },
  });
  return { ...SAME, ...sheet, badgeSize: badge, compact };
}

/** What a row looks like at either density. */
const SAME = StyleSheet.create({
  head: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    columnGap: 16,
    rowGap: 6,
  },
  list: { overflow: 'hidden', paddingVertical: 4 },
  move: { flexGrow: 1, flexShrink: 1, gap: 1 },
  title: { flexDirection: 'row', alignItems: 'center', gap: TITLE_GAP },
  risk: { textTransform: 'capitalize' },
  cost: { fontFamily: fonts.mono },
  share: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  track: { width: 52, height: 4, borderRadius: 2, overflow: 'hidden' },
  fillBar: { height: '100%', borderRadius: 2 },
  percent: { minWidth: SHARE_WIDTH, textAlign: 'right', fontFamily: fonts.mono },
  evaluation: { minWidth: EVALUATION_WIDTH, textAlign: 'right', fontFamily: fonts.mono },
  mark: { width: MARK_SIZE, height: MARK_SIZE },
});

type Styles = ReturnType<typeof rowStyles>;

const COMFORTABLE = rowStyles(
  {
    inset: 14,
    gap: 12,
    dot: 10,
    san: 17,
    badge: 16,
    row: { paddingVertical: 8 },
  },
  false,
);

/** Space at each end of a compact row: a phone's layout pulls its pane into the page's margin by it. */
export const COMPACT_INSET = 8;

/** A phone's rows: a short line each, as tall as a thumb can still pick out. */
const COMPACT = rowStyles(
  {
    inset: COMPACT_INSET,
    gap: 8,
    dot: 8,
    san: 16,
    badge: 14,
    row: { minHeight: 32, paddingVertical: 2, borderRadius: 10 },
  },
  true,
);
