import Ionicons from '@expo/vector-icons/Ionicons';
import { Button, Separator, Stack } from '@reactive/silk-native';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import { Eyebrow, useLabelled } from '@/components/Eyebrow';
import { StatusHeadline } from '@/components/GameStatus';
import { Scoresheet } from '@/components/Scoresheet';
import { Tip } from '@/components/Tip';
import type { Analysis } from '@/evaluation/evaluation';
import { type Color, numberedMove } from '@/game/replay';
import { compareMove } from '@/review/comparison';
import type { ReviewMove } from '@/review/review';
import type { Review } from '@/review/useReview';
import { qualityLooks } from '@/theme/moveQuality';

import { MoveCard } from './MoveCard';

/** What the panel shows of a review (`useReview`); any analyses will do, so the gallery can make them up. */
export type ReviewView = { readonly analyses: readonly (Analysis | undefined)[] } & Pick<
  Review,
  | 'plies'
  | 'ply'
  | 'moves'
  | 'pointed'
  | 'waiting'
  | 'nextMoment'
  | 'goto'
  | 'point'
  | 'tryAgain'
  | 'failure'
>;

interface Props {
  /** What the headline's eyebrow names: "Review · Caro-Kann". */
  readonly eyebrow: string;
  /** The learner's side. */
  readonly learner: Color;
  readonly review: ReviewView;
}

/**
 * The review's panel beside the board: the headline, the move card for the
 * move shown, the three actions, and the scoresheet. At the start position,
 * before any move, the headline speaks for the whole game.
 */
export function ReviewPanel({ eyebrow, learner, review }: Props) {
  const labelled = useLabelled();
  const { plies, ply, moves, analyses, pointed, nextMoment, goto, point } = review;
  const move = ply > 0 ? moves[ply - 1] : undefined;
  return (
    <Stack gap="5">
      <StatusHeadline eyebrow={eyebrow} {...reviewHeadline(review)} />
      {move ? (
        <MoveCard
          whose={move.mover === learner ? 'yours' : 'theirs'}
          comparison={compareMove(plies, analyses, ply, learner)}
          quality={move.quality}
          qualityDetail={lossDetail(move)}
          pointed={pointed}
          onPoint={point}
        />
      ) : null}
      <View style={styles.actions}>
        {/* Retry and Show best come with retrying a moment; until then they do nothing. */}
        <ActionIcon icon="refresh" label="Retry: play this move again" />
        <ActionIcon icon="bulb-outline" label="Show best: Stockfish's best move here" />
        <View style={styles.spacer} />
        <Button
          disabled={nextMoment === undefined}
          onPress={() => nextMoment !== undefined && goto(nextMoment)}
        >
          {ply === 0 ? 'First moment ' : 'Next moment '}
          <Ionicons name="arrow-forward" size={15} />
        </Button>
      </View>
      <Separator />
      <Stack style={labelled}>
        <Eyebrow>Scoresheet</Eyebrow>
        <Scoresheet
          plies={plies}
          qualities={moves.map(({ quality }) => quality)}
          unjudged={moves.map(({ status }) =>
            status === 'waiting' || status === 'failed' ? status : undefined,
          )}
          ply={ply}
          onGoto={goto}
        />
      </Stack>
    </Stack>
  );
}

/** An action as an icon, named by its tooltip and to screen readers; none works yet. */
function ActionIcon({
  icon,
  label,
}: {
  readonly icon: ComponentProps<typeof Ionicons>['name'];
  readonly label: string;
}) {
  return (
    <Tip tip={label}>
      <Button variant="outline" disabled accessibilityLabel={label}>
        <Ionicons name={icon} size={17} />
      </Button>
    </Tip>
  );
}

/**
 * The headline: while moves still wait for Stockfish, at the start or at
 * one of them, that the reviews are coming in, with how far they've got;
 * at a move, its label; at a move whose search gave up, a Try again.
 */
export function reviewHeadline({
  plies,
  ply,
  moves,
  waiting,
  failure,
  tryAgain,
}: Pick<ReviewView, 'plies' | 'ply' | 'moves' | 'waiting' | 'failure' | 'tryAgain'>) {
  const move = ply > 0 ? moves[ply - 1] : undefined;
  const coming = {
    title: 'The reviews are coming in…',
    detail: `Checking each move: ${moves.length - waiting} of ${moves.length}.`,
  };
  if (!move) {
    if (waiting) return coming;
    const failed = moves.filter(({ status }) => status === 'failed').length;
    return {
      title: 'The reviews are in.',
      detail: failed
        ? `${failed} of ${moves.length} moves couldn't be checked.`
        : `All ${moves.length} moves checked.`,
    };
  }
  const named = numberedMove(plies[ply].move!.san, ply, '…');
  if (move.status === 'waiting') return coming;
  if (move.status === 'failed') {
    const error = failure(ply);
    return {
      title: 'No verdict yet.',
      detail: named,
      failure: error && { who: 'Stockfish', error, onRetry: () => tryAgain(ply) },
    };
  }
  return { title: `${qualityLooks[move.quality].name}.`, detail: named };
}

/** How much of the mover's winning chances a judged move gave away, when it gave any: "Here: 26%." */
function lossDetail(move: ReviewMove) {
  if (move.status !== 'judged') return undefined;
  const lost = Math.round((move.before - move.after) * 100);
  return lost > 0 ? `Here: ${lost}%.` : undefined;
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  spacer: { flexGrow: 1 },
});
