import { Pressable, Surface, Text, useTheme } from '@reactive/silk-native';
import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import type { Uci } from '@/lesson/lesson';
import type { Candidate } from '@/lesson/select';
import { hovers } from '@/board/pointer';
import { QualityBadge } from '@/components/QualityBadge';
import { fonts } from '@/theme/theme';
import { toneColors } from '@/theme/drawingTones';

interface Props {
  readonly candidates: readonly Candidate[];
  /** The candidate the board draws as the main one (see `candidateDrawings`). */
  readonly main?: Candidate;
  /** The row previewed, whether its row is pointed at or its piece dragged onto its square. */
  readonly pointed?: Uci;
  /** Where each move leads, when it enters another variation. */
  readonly leadsTo: (candidate: Candidate) => string | undefined;
  /** The rows are the learner's to play now; otherwise they only preview. */
  readonly playable: boolean;
  readonly onPlay: (candidate: Candidate) => void;
  /**
   * The learner points at a row: the mouse moves over it, keyboard focus
   * lands on it, or a finger holds it (or taps it, when it isn't playable).
   */
  readonly onPoint: (uci: Uci) => void;
  /**
   * Keyboard focus moves on past the last row. The preview ends first, so the
   * idea card focus lands in shows the position's own notes.
   */
  readonly onTabOut: () => void;
}

/**
 * The guide's moves at the position on the board, one row each, most played
 * first. Pointing at a row previews its move on the board; pressing it plays
 * the move when it's the learner's to play. Each row's dot matches its arrow
 * on the board.
 */
export function CandidateList({
  candidates,
  main,
  pointed,
  leadsTo,
  playable,
  onPlay,
  onPoint,
  onTabOut,
}: Props) {
  return (
    <Surface elevation="sunken" border="subtle" radius="md" style={styles.list}>
      {candidates.map((candidate, index) => (
        <Row
          key={candidate.move.uci}
          candidate={candidate}
          main={candidate === main}
          pointed={candidate.move.uci === pointed}
          leadsTo={leadsTo(candidate)}
          // A lone move's share is always all of the games.
          share={candidates.length > 1 ? candidate.share : undefined}
          playable={playable}
          onPlay={onPlay}
          onPoint={onPoint}
          onTabOut={index === candidates.length - 1 ? onTabOut : undefined}
        />
      ))}
    </Surface>
  );
}

/** How long the mouse rests on a row before it points at it. */
const ROW_REST_MS = 150;

interface RowProps {
  readonly candidate: Candidate;
  readonly main: boolean;
  readonly pointed: boolean;
  readonly leadsTo?: string;
  /** The move's share of the games, when worth showing. */
  readonly share?: number;
  readonly playable: boolean;
  readonly onPlay: (candidate: Candidate) => void;
  readonly onPoint: (uci: Uci) => void;
  /** Tab (forward) leaves this row for whatever follows the list. */
  readonly onTabOut?: () => void;
}

function Row({
  candidate,
  main,
  pointed,
  leadsTo,
  share,
  playable,
  onPlay,
  onPoint,
  onTabOut,
}: RowProps) {
  const { theme } = useTheme();
  const { color } = theme.semantic;
  const { move, san } = candidate;
  const tone = toneColors[main ? 'main' : 'other'];
  const point = () => onPoint(move.uci);
  // The mouse points at a row once it rests there, so one crossed on the way
  // from another row down to the idea card leaves that row's preview be.
  const resting = useRef<ReturnType<typeof setTimeout>>(undefined);
  const stopResting = () => {
    clearTimeout(resting.current);
    resting.current = undefined;
  };
  useEffect(() => stopResting, []);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${san}${move.book ? ', book move' : ''}${share === undefined ? '' : `, ${percent(share)} of games`}`}
      accessibilityHint={playable ? 'Plays this move' : undefined}
      // Not disabled: the opponent's rows still preview while not playable.
      accessibilityState={{ disabled: !playable }}
      onPress={playable ? () => onPlay(candidate) : point}
      onLongPress={point}
      // A move, not an enter: a list that changes under a still mouse
      // previews nothing until the mouse moves. Leaving keeps the preview
      // (the screen ends it), so the learner can go on to its notes.
      onPointerMove={({ nativeEvent }) => {
        if (pointed || !hovers(nativeEvent.pointerType)) return;
        // Each move starts the wait again: a mouse still crossing the row isn't resting.
        stopResting();
        resting.current = setTimeout(() => {
          resting.current = undefined;
          point();
        }, ROW_REST_MS);
      }}
      onPointerLeave={stopResting}
      // Before the browser moves focus, so it lands among the notes shown next.
      onKeyDown={(event: unknown) => {
        const { key, shiftKey } = event as ReactKeyboardEvent;
        if (key === 'Tab' && !shiftKey) onTabOut?.();
      }}
      onFocus={point}
      style={({ pressed }) => [
        styles.row,
        (pointed || (pressed && playable)) && {
          backgroundColor: color.tones.neutral.subtle,
        },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: tone }]} />
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
          <Text role="caption" tone="secondary" numberOfLines={1}>
            {leadsTo}
          </Text>
        ) : null}
      </View>
      {share === undefined ? null : (
        <View style={styles.share}>
          <View style={[styles.track, { backgroundColor: color.tones.neutral.subtle }]}>
            <View style={[styles.fillBar, { width: `${share * 100}%`, backgroundColor: tone }]} />
          </View>
          <Text role="caption" tone="secondary" style={styles.percent}>
            {percent(share)}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

/** The book badge, as in the scoresheet, about the height of the notation's capitals. */
const BOOK_BADGE_SIZE = 16;

const percent = (share: number) => `${Math.round(share * 100)}%`;

const styles = StyleSheet.create({
  list: { overflow: 'hidden', paddingVertical: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    outlineOffset: -2,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  move: { flex: 1, gap: 1 },
  title: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  san: { fontFamily: fonts.mono, fontSize: 17 },
  risk: { textTransform: 'capitalize' },
  share: { width: 92, flexDirection: 'row', alignItems: 'center', gap: 8 },
  track: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
  fillBar: { height: '100%', borderRadius: 2 },
  percent: { width: 32, textAlign: 'right', fontFamily: fonts.mono },
});
