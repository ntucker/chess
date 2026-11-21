import { AsyncBoundary, useSuspense } from '@data-client/react';
import { Spinner } from '@reactive/silk-native';
import { useIsFocused } from 'expo-router';
import { use } from 'react';
import { StyleSheet, View } from 'react-native';

import { lastMoveBadge } from '@/board/drawing';
import { BrowserOnly } from '@/components/BrowserOnly';
import { StatusHeadline } from '@/components/GameStatus';
import { NewVersionPage } from '@/components/NewVersion';
import { BoardColumn, BoardColumnPlaceholder, Stage } from '@/components/Stage';
import { NewVersionError } from '@/files/newVersion';
import { material } from '@/game/material';
import { type Color, colorName, fenAfter, opposite, replay } from '@/game/replay';
import type { Uci } from '@/lesson/lesson';
import { withOpenings } from '@/lesson/openings';
import { getLesson, LessonIndexContext, LESSONS, type LessonId } from '@/resources/lesson';
import { useReview } from '@/review/useReview';

import { ReviewPanel } from './ReviewPanel';

/** The review's address, as the URL has it: `/review?moves=e2e4 c7c6&side=black&lesson=caro-kann`. */
export interface ReviewAddress {
  /** The game's moves (UCI) from the start, separated by spaces. */
  readonly moves?: string;
  /** The learner's side. */
  readonly side?: string;
  /** The lesson the game was played in, if any. */
  readonly lesson?: string;
}

const TITLE = 'Review · Opening Night';

/**
 * The review of the game the address names, on the board's page: the board
 * column shows the move the review is at, and the panel beside it says how
 * the move did. The address is all it needs, so a reload reopens it. A
 * move that isn't legal ends the game there.
 */
export function ReviewPage({ moves = '', side, lesson }: ReviewAddress) {
  if (side !== 'white' && side !== 'black') return <ReviewPlaceholder message={NO_GAME} />;
  if (lesson !== undefined && !Object.hasOwn(LESSONS, lesson)) {
    return <ReviewPlaceholder message="There is no lesson here." />;
  }
  const line = moves ? moves.split(' ') : [];
  const played = line.slice(0, replay(line).length - 1);
  if (!played.length) return <ReviewPlaceholder message={NO_GAME} />;
  return (
    <BrowserOnly fallback={<ReviewPlaceholder />}>
      <AsyncBoundary fallback={<ReviewPlaceholder />} errorComponent={ReviewFailure}>
        <ReviewScreen moves={played} learner={side} lesson={lesson as LessonId | undefined} />
      </AsyncBoundary>
    </BrowserOnly>
  );
}

const NO_GAME = 'There is no game here to review.';

function ReviewScreen({
  moves,
  learner,
  lesson,
}: {
  readonly moves: readonly Uci[];
  readonly learner: Color;
  readonly lesson?: LessonId;
}) {
  const picked = useSuspense(getLesson, lesson ?? null);
  const index = use(LessonIndexContext);
  // The lesson as the game played it: with the other openings' first moves (`withOpenings`).
  const played = picked ? withOpenings(picked, index) : undefined;
  const review = useReview({ moves, learner, lesson: played, active: useIsFocused() });
  const { plies, ply, current, pointed } = review;
  const move = ply > 0 ? review.moves[ply - 1] : undefined;
  const preview = pointed && ply > 0 ? fenAfter(plies[ply - 1].fen, pointed) : undefined;
  return (
    <Stage
      title={TITLE}
      header={{ place: { name: 'Review' }, back: { href: '/', label: 'Back to the game' } }}
      board={
        <BoardColumn
          game={{
            moves,
            ply,
            goto: review.goto,
            current,
            toMove: undefined,
            thinking: false,
            material: material(current.fen),
          }}
          rival={{ name: 'Opponent', detail: colorName(opposite(learner)) }}
          board={{
            fen: current.fen,
            preview: preview === current.fen ? undefined : preview,
            orientation: learner,
            turnColor: current.turn,
            dests: {},
            lastMove: current.move ? [current.move.from, current.move.to] : undefined,
            drawings: lastMoveBadge(current.move?.to, move?.quality),
            check: current.check,
            onMove: () => {},
          }}
          evaluationReads="stockfish"
        />
      }
      program={
        <ReviewPanel
          eyebrow={picked ? `Review · ${picked.title}` : 'Review'}
          learner={learner}
          review={review}
        />
      }
    />
  );
}

/** The review when its lesson failed to load. */
function ReviewFailure({ error }: { readonly error: Error }) {
  if (error instanceof NewVersionError) {
    return <NewVersionPage detail="Reload to open the review." />;
  }
  return <ReviewPlaceholder message={error.message} />;
}

/** The review's page before its game is ready, or with `message` when it can't be shown. */
function ReviewPlaceholder({ message }: { readonly message?: string }) {
  return (
    <Stage
      title={TITLE}
      header={{ place: { name: 'Review' }, back: { href: '/', label: 'Back to the game' } }}
      board={
        <BoardColumnPlaceholder>
          {message ? null : <Spinner label="Setting up the review" />}
        </BoardColumnPlaceholder>
      }
      program={
        <View style={styles.placeholder}>
          <StatusHeadline
            eyebrow="Review"
            title={message ? 'Curtain stays down.' : 'Setting the stage…'}
            detail={message ?? 'The review is on its way.'}
          />
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({ placeholder: { minHeight: 200 } });
