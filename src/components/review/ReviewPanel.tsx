import { Separator, Stack } from '@reactive/silk-native';
import { StyleSheet, View } from 'react-native';

import { Eyebrow, useLabelled, useSections } from '@/components/Eyebrow';
import { StatusHeadline } from '@/components/GameStatus';
import { ScoresheetDrawer } from '@/components/ScoresheetDrawer';
import { Scoresheet } from '@/components/Scoresheet';
import { SourceFootnote } from '@/components/SourceLink';
import { type Color, numberedMove } from '@/game/replay';
import { compareMove } from '@/review/comparison';
import type { ReviewMove } from '@/review/review';
import type { Review } from '@/review/useReview';
import { NarrowOnly, useNarrowPart } from '@/theme/Narrow';
import { qualityLooks } from '@/theme/moveQuality';

import { MoveCard } from './MoveCard';
import { ReviewActions } from './ReviewActions';
import { type GraphView, ReviewGraph } from './ReviewGraph';

/** What the panel shows of a review (`useReview`); any analyses will do, so the gallery can make them up. */
export type ReviewView = GraphView &
  Pick<Review, 'pointed' | 'nextMoment' | 'point' | 'tryAgain' | 'failure'>;

interface Props {
  /** What the headline's eyebrow names: "Review · Caro-Kann". */
  readonly eyebrow: string;
  /** The learner's side. */
  readonly learner: Color;
  readonly review: ReviewView;
  /** On a narrow page, the scoresheet drawer while it's open (from the header), covering the headline and the move card. */
  readonly drawer?: { readonly onClose: () => void };
}

/**
 * The review's panel beside the board: the headline, the graph of the game, the move card for the
 * move shown, the three actions, and the scoresheet. At the start position,
 * before any move, the headline speaks for the whole game. A narrow page
 * draws the headline as one line under the header, which names the place,
 * keeps the actions in a bar at the screen's foot (`ReviewActionBar`), and
 * opens the scoresheet in a drawer.
 */
export function ReviewPanel({ eyebrow, learner, review, drawer }: Props) {
  const part = useNarrowPart();
  const labelled = useLabelled();
  const sections = useSections();
  const { plies, ply, moves, analyses, pointed, nextMoment, goto, point } = review;
  const move = ply > 0 ? moves[ply - 1] : undefined;
  const scoresheet = {
    plies,
    marks: moves.map((move) => (move.quality === undefined ? move.status : move.quality)),
    ply,
    onGoto: goto,
  };
  return (
    <Stack {...part('drawer-panel', sections)}>
      {/* The drawer covers the rest, on a phone's short page all the room it can get. */}
      <View {...part(drawer && 'wide-only', sections)}>
        <StatusHeadline eyebrow={eyebrow} eyebrowInHeader news="all" {...reviewHeadline(review)} />
        {/* A narrow page draws the graph in the row under the board. */}
        <View {...part('wide-only', styles.graph)}>
          <ReviewGraph review={review} learner={learner} height={GRAPH_HEIGHT} />
        </View>
        {move ? (
          <MoveCard
            whose={move.mover === learner ? 'yours' : 'theirs'}
            // A book move is the guide's: no other moves, and no changes beside its badge.
            comparison={compareMove(plies, move.status === 'book' ? [] : analyses, ply, learner)}
            quality={move.quality}
            qualityDetail={lossDetail(move)}
            pointed={pointed}
            onPoint={point}
          />
        ) : null}
        {/* The header's scoresheet button takes the source link's place there. */}
        <NarrowOnly>
          <SourceFootnote />
        </NarrowOnly>
      </View>
      {drawer ? <ScoresheetDrawer {...scoresheet} onClose={drawer.onClose} /> : null}
      {/* This scoresheet stays while the drawer is open, so a window widened meanwhile still shows one. */}
      <Stack {...part('wide-only', sections)}>
        <ReviewActions ply={ply} nextMoment={nextMoment} goto={goto} />
        <Separator />
        <Stack style={labelled}>
          <Eyebrow>Scoresheet</Eyebrow>
          <Scoresheet {...scoresheet} />
        </Stack>
      </Stack>
    </Stack>
  );
}

/**
 * The headline: while moves still wait for Stockfish, at the start or at
 * one of them, that the reviews are coming in, with how far they've got;
 * at a move, its label; at a move whose search gave up, a Try again.
 */
function reviewHeadline({
  plies,
  ply,
  moves,
  failure,
  tryAgain,
}: Pick<ReviewView, 'plies' | 'ply' | 'moves' | 'failure' | 'tryAgain'>) {
  const move = ply > 0 ? moves[ply - 1] : undefined;
  const waiting = moves.filter(({ status }) => status === 'waiting').length;
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

/** The graph's height on a wide page. */
const GRAPH_HEIGHT = 72;

const styles = StyleSheet.create({ graph: { marginVertical: 12 } });
