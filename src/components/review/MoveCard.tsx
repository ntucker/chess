import { Pressable, Stack, Surface, Text, useTheme } from '@reactive/silk-native';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { type MoveQuality, qualityRule } from '@/analysis/quality';
import { hovers } from '@/board/pointer';
import { Eyebrow, useLabelled } from '@/components/Eyebrow';
import { PointingArea } from '@/components/lesson/PointingArea';
import { TippedBadge } from '@/components/QualityBadge';
import { Tip } from '@/components/Tip';
import type { Uci } from '@/lesson/lesson';
import type { ComparedMove, Comparison } from '@/review/comparison';
import { qualityLooks } from '@/theme/moveQuality';
import { fonts } from '@/theme/theme';

interface Props {
  /** Whose move it is: the learner's, or the opponent's. */
  readonly whose: 'yours' | 'theirs';
  readonly comparison: Comparison;
  /** The move played's label, once it has one. */
  readonly quality?: MoveQuality;
  /** What the label says of this move, after its rule: "Here: 26%." */
  readonly qualityDetail?: string;
  /** The row previewed on the board. */
  readonly pointed?: Uci;
  /** The learner points at a row, or at none. */
  readonly onPoint: (uci?: Uci) => void;
}

/**
 * The move shown, as two cards: the move played, with its label, and
 * Stockfish's other top moves from the same position, each with how it
 * changes the position for the learner. Pointing at a row (the mouse
 * moving over it, keyboard focus, or a tap) previews its move on the board;
 * the mouse or focus leaving the cards ends the preview (`PointingArea`).
 */
export function MoveCard({ whose, comparison, quality, qualityDetail, pointed, onPoint }: Props) {
  const labelled = useLabelled();
  const { played, others } = comparison;
  const tip = quality && qualityTip(quality, qualityDetail);
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
          </Surface>
        </Stack>
        {others.length ? (
          <Stack style={labelled}>
            <Eyebrow>{"Stockfish's moves"}</Eyebrow>
            <Surface elevation="sunken" border="subtle" radius="md" style={styles.card}>
              {others.map((move) => (
                <Row key={move.uci} move={move} pointed={pointed === move.uci} onPoint={onPoint} />
              ))}
            </Surface>
          </Stack>
        ) : null}
      </Stack>
    </PointingArea>
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
          {san}
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

/** "Blunder: gave away 20% or more of the winning chances. Here: 26%." */
const qualityTip = (quality: MoveQuality, detail?: string) =>
  `${qualityLooks[quality].name}: ${qualityRule(quality)}.${detail ? ` ${detail}` : ''}`;

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
});
