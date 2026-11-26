import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, Stack, Surface, Text, useTheme } from '@reactive/silk-native';
import { type Href, Link } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import type { ReviewQuality } from '@/analysis/quality';
import { hovers } from '@/board/pointer';
import { Eyebrow, useLabelled } from '@/components/Eyebrow';
import { PointingArea } from '@/components/lesson/PointingArea';
import { Notation } from '@/components/Notation';
import { qualityTip, TippedBadge } from '@/components/QualityBadge';
import { Tip } from '@/components/Tip';
import type { Uci } from '@/lesson/lesson';
import type { ComparedMove, Comparison } from '@/review/comparison';
import { type Answer, answerOwner, type GuideAnswer, type Try } from '@/review/retry';
import { fonts } from '@/theme/theme';

interface Props {
  /** Whose move it is: the learner's, or the opponent's. */
  readonly whose: 'yours' | 'theirs';
  readonly comparison: Comparison;
  /** The move played's label, once it has one. */
  readonly quality?: ReviewQuality;
  /** What the label says of this move, after its rule: "Here: 26%." */
  readonly qualityDetail?: string;
  /**
   * Whether Stockfish's moves stay hidden (`Moment.hidden`): until a retry
   * passes or Show best, or until the move is judged.
   */
  readonly hidden?: 'until retry' | 'until judged';
  /** The learner's tries at this move, oldest first. */
  readonly tries?: readonly Try[];
  /** The answer, once revealed: the guide's move gets a line naming it, with "Practice this line". */
  readonly guide?: Answer;
  /** Once revealed, where "Play on from here" goes: the game's page, with the corrected line. */
  readonly playOn?: Href;
  /** The row previewed on the board. */
  readonly pointed?: Uci;
  /** The learner points at a row, or at none. */
  readonly onPoint: (uci?: Uci) => void;
}

/**
 * The move shown, as cards: the move played, with its label; the learner's
 * tries at it; and Stockfish's other top moves from the same position, or
 * "Other moves hidden" until a retry passes. Each says how it changes the
 * position for the learner. Pointing at a row (the mouse moving over it,
 * keyboard focus, or a tap) previews its move on the board; the mouse or
 * focus leaving the cards ends the preview (`PointingArea`).
 */
export function MoveCard({
  whose,
  comparison,
  quality,
  qualityDetail,
  hidden,
  tries = [],
  guide,
  playOn,
  pointed,
  onPoint,
}: Props) {
  const labelled = useLabelled();
  const { played, others } = comparison;
  const tip = quality && qualityTip(quality, qualityDetail);
  const guideMove = guide?.guide;
  return (
    <PointingArea onLeave={() => onPoint(undefined)}>
      <Stack gap="4">
        <Stack style={labelled}>
          <Eyebrow>{whose === 'yours' ? 'Your move' : 'Their move'}</Eyebrow>
          <Surface elevation="sunken" border="subtle" radius="md" style={styles.card}>
            <Row
              move={played}
              badge={
                quality && tip && <TippedBadge quality={quality} size={BADGE_SIZE} tip={tip} />
              }
              spoken={tip}
              pointed={pointed === played.uci}
              onPoint={onPoint}
            />
            {hidden ? <HiddenRow until={hidden} /> : null}
          </Surface>
        </Stack>
        {tries.length ? (
          <Stack style={labelled}>
            <Eyebrow>Your tries</Eyebrow>
            <Surface elevation="sunken" border="subtle" radius="md" style={styles.card}>
              {tries.map((tried, n) => (
                <TryRow
                  // A move tried twice is two rows.
                  key={`${n} ${tried.uci}`}
                  tried={tried}
                  pointed={pointed === tried.uci}
                  onPoint={onPoint}
                />
              ))}
            </Surface>
          </Stack>
        ) : null}
        {!hidden && others.length ? (
          <Stack style={labelled}>
            <Eyebrow>{"Stockfish's moves"}</Eyebrow>
            <Surface elevation="sunken" border="subtle" radius="md" style={styles.card}>
              {others.map((move) => (
                <Row key={move.uci} move={move} pointed={pointed === move.uci} onPoint={onPoint} />
              ))}
            </Surface>
          </Stack>
        ) : null}
        {guideMove ? (
          <GuideLine
            san={guide.san}
            quality={guideMove.quality}
            note={guideMove.note}
            practice={guideMove.practice}
          />
        ) : null}
        {playOn ? <PlayOn href={playOn} /> : null}
      </Stack>
    </PointingArea>
  );
}

/** A try's row: its label once judged, and how it changes the position. */
function TryRow({
  tried,
  pointed,
  onPoint,
}: {
  readonly tried: Try;
  readonly pointed: boolean;
  readonly onPoint: (uci?: Uci) => void;
}) {
  if (tried.status !== 'judged') {
    const status = tried.status === 'waiting' ? 'Checking…' : "Couldn't be checked";
    return (
      <Row
        move={{
          ...tried,
          change: { label: tried.status === 'waiting' ? '…' : '–', description: status },
        }}
        spoken={status}
        pointed={pointed}
        onPoint={onPoint}
      />
    );
  }
  const tip = qualityTip(tried.quality);
  return (
    <Row
      move={tried}
      badge={<TippedBadge quality={tried.quality} size={BADGE_SIZE} tip={tip} />}
      spoken={tip}
      pointed={pointed}
      onPoint={onPoint}
    />
  );
}

/** Stands in for Stockfish's moves until a retry passes or Show best is pressed, or the move is judged. */
function HiddenRow({ until }: { readonly until: NonNullable<Props['hidden']> }) {
  const { theme } = useTheme();
  const muted = theme.semantic.color.textSecondary;
  return (
    <Tip
      tip={
        until === 'until retry'
          ? "Retry, or press Show best, to see Stockfish's moves"
          : "Stockfish's moves show once this move is judged"
      }
    >
      <View style={[styles.row, styles.hidden]}>
        <Ionicons name="eye-off-outline" size={16} color={muted} />
        <Text role="caption" tone="secondary">
          Other moves hidden
        </Text>
      </View>
    </Tip>
  );
}

/**
 * The guide's move, once revealed where the learner left the guide: its
 * badge (the guide's own, or an opportunity's), its name with the lesson's
 * idea note as the tooltip, and a link that opens the lesson on that line.
 */
function GuideLine({
  san,
  quality,
  note,
  practice,
}: { readonly san: string } & Omit<GuideAnswer, 'uci'>) {
  const named = (
    <Text role="body">
      <Notation>{`${san} is ${answerOwner(quality)} move.`}</Notation>
    </Text>
  );
  return (
    <View style={styles.guide}>
      <TippedBadge quality={quality} size={BADGE_SIZE} tip={qualityTip(quality)} />
      {note ? <Tip tip={note}>{named}</Tip> : named}
      <Link href={practice}>
        <Text role="body" tone="accent" style={styles.link}>
          Practice this line
        </Text>
      </Link>
    </View>
  );
}

interface RowProps {
  readonly move: ComparedMove;
  readonly badge?: ReactNode;
  /** What the badge says, for screen readers, which read the row's label in place of what's inside it. */
  readonly spoken?: string;
  readonly pointed: boolean;
  readonly onPoint: (uci?: Uci) => void;
}

function Row({ move, badge, spoken, pointed, onPoint }: RowProps) {
  const { theme } = useTheme();
  const { uci, san, change } = move;
  const point = () => onPoint(uci);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[san, spoken, change?.description].filter(Boolean).join(', ')}
      accessibilityHint="Shows this move on the board"
      onPress={point}
      onFocus={point}
      onPointerMove={({ nativeEvent }) => {
        if (!pointed && hovers(nativeEvent.pointerType)) point();
      }}
      style={[
        styles.row,
        pointed && { backgroundColor: theme.semantic.color.tones.neutral.subtle },
      ]}
    >
      <View style={styles.move}>
        <Text role="body" style={styles.san}>
          <Notation>{san}</Notation>
        </Text>
        {badge}
      </View>
      {change ? (
        <Tip tip={change.description}>
          <Text role="caption" tone="secondary" style={styles.change}>
            {change.label}
          </Text>
        </Tip>
      ) : null}
    </Pressable>
  );
}

/**
 * "Play on from here": the game's page over the review, where a new game
 * against the same opponent starts from the corrected line. Back returns to
 * the review, and Back again to the game reviewed.
 */
function PlayOn({ href }: { readonly href: Href }) {
  const { theme } = useTheme();
  return (
    <Tip tip="A new game from the corrected position, against the same opponent. Back returns to the review.">
      <Link href={href} push>
        <View style={styles.playOn}>
          <Ionicons name="play-outline" size={16} color={theme.semantic.color.tones.accent.text} />
          <Text role="body" tone="accent" style={styles.link}>
            Play on from here
          </Text>
        </View>
      </Link>
    </Tip>
  );
}

/** The label's badge beside the move, about the height of the notation's capitals. */
const BADGE_SIZE = 16;

const styles = StyleSheet.create({
  card: { overflow: 'hidden', paddingVertical: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    outlineOffset: -2,
  },
  move: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  san: { fontFamily: fonts.mono, fontSize: 17 },
  change: { minWidth: 44, textAlign: 'right', fontFamily: fonts.mono },
  hidden: { gap: 8 },
  guide: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 4 },
  link: { textDecorationLine: 'underline' },
  playOn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
