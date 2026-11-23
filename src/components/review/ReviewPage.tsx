import { AsyncBoundary, useSuspense } from '@data-client/react';
import { Spinner } from '@reactive/silk-native';
import { useIsFocused } from 'expo-router';
import { use, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { lastMoveBadge, refutationArrow } from '@/board/drawing';
import { BrowserOnly } from '@/components/BrowserOnly';
import { StatusHeadline } from '@/components/GameStatus';
import { NewVersionPage } from '@/components/NewVersion';
import { BoardColumn, BoardColumnPlaceholder, Stage } from '@/components/Stage';
import { stepButton, Transport } from '@/components/Transport';
import { NewVersionError } from '@/files/newVersion';
import { material } from '@/game/material';
import { type Color, colorName, dropMove, fenAfter, opposite, replay } from '@/game/replay';
import type { Uci } from '@/lesson/lesson';
import { lessonHref, withOpenings } from '@/lesson/openings';
import { getLesson, isLessonId, LessonIndexContext, type LessonId } from '@/resources/lesson';
import { addressMoves, type ReviewAddress } from '@/review/address';
import { REVIEW_ENGINE, useReview } from '@/review/useReview';

import { ReviewNames } from './NarrowBars';
import { ReviewActionBar } from './ReviewActions';
import { ReviewGraph } from './ReviewGraph';
import { ReviewPanel } from './ReviewPanel';

const TITLE = 'Review · Opening Night';
/** Back to the game: history's previous page, or, opened fresh, the lesson the review came from. */
const back = (lesson?: LessonId) =>
  ({ href: lesson ? lessonHref(lesson) : '/', label: 'Back to the game' }) as const;

/**
 * The review of the game the address names, on the board's page: the board
 * column shows the move the review is at, and the panel beside it says how
 * the move did. The address is all it needs, so a reload reopens it. A
 * move that isn't legal ends the game there. The export can't know the
 * address, so the page pre-renders only its frame and reads the address in
 * the browser.
 */
export function ReviewPage(address: ReviewAddress) {
  return (
    <BrowserOnly fallback={<ReviewPlaceholder />}>
      <AddressedReview {...address} />
    </BrowserOnly>
  );
}

/** The review the address names, or why there is none. */
function AddressedReview({ moves, side, lesson }: ReviewAddress) {
  if (lesson !== undefined && !isLessonId(lesson)) {
    return <ReviewPlaceholder message="There is no lesson here." />;
  }
  if (side !== 'white' && side !== 'black') {
    return <ReviewPlaceholder message={NO_GAME} lesson={lesson} />;
  }
  const line = addressMoves(moves);
  const played = line.slice(0, replay(line).length - 1);
  if (!played.length) return <ReviewPlaceholder message={NO_GAME} lesson={lesson} />;
  return (
    <AsyncBoundary fallback={<ReviewPlaceholder lesson={lesson} />} errorComponent={ReviewFailure}>
      <ReviewScreen moves={played} learner={side} lesson={lesson} />
    </AsyncBoundary>
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
  const { plies, ply, current, pointed, moment, goto } = review;
  const preview = pointed && ply > 0 ? fenAfter(plies[ply - 1].fen, pointed) : undefined;
  const retrying = moment.board === 'retry';
  // Only a narrow page shows the header's button, so only there does the drawer open.
  const [scoresheetOpen, setScoresheetOpen] = useState(false);
  return (
    <Stage
      title={TITLE}
      header={{
        place: picked ? { name: picked.title, parent: 'Review' } : { name: 'Review' },
        back: back(lesson),
        narrowButton: {
          icon: 'list',
          label: 'Scoresheet',
          expanded: scoresheetOpen,
          onPress: () => setScoresheetOpen(!scoresheetOpen),
        },
      }}
      board={
        <BoardColumn
          game={{
            moves,
            ply,
            goto,
            current,
            toMove: retrying ? learner : undefined,
            thinking: false,
            material: material(current.fen),
          }}
          rival={{ name: 'Opponent', detail: colorName(opposite(learner)) }}
          board={{
            fen: current.fen,
            preview: preview === current.fen ? undefined : preview,
            orientation: learner,
            turnColor: current.turn,
            movableColor: retrying ? learner : undefined,
            dests: retrying ? current.dests : {},
            lastMove: current.move ? [current.move.from, current.move.to] : undefined,
            drawings: [
              ...lastMoveBadge(current.move?.to, moment.badge),
              ...refutationArrow(moment.arrow),
            ],
            check: current.check,
            onMove: (from, to) => {
              const uci = retrying ? dropMove(current.fen, from, to) : undefined;
              if (uci) review.play(uci);
            },
          }}
          evaluationReads={REVIEW_ENGINE}
          evaluationLine={review.shownLine}
          narrowBars={{
            names: <ReviewNames learner={learner} />,
            controls: (
              <Transport
                ply={ply}
                total={moves.length}
                onGoto={goto}
                fill
                middle={
                  <ReviewGraph review={review} learner={learner} height={stepButton.height} />
                }
              />
            ),
          }}
        />
      }
      program={
        <ReviewPanel
          eyebrow={picked ? `Review · ${picked.title}` : 'Review'}
          learner={learner}
          review={review}
          drawer={scoresheetOpen ? { onClose: () => setScoresheetOpen(false) } : undefined}
        />
      }
      programFoot={<ReviewActionBar {...review} />}
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

/**
 * The review's page before its game is ready, or with `message` when it
 * can't be shown. Back goes to `lesson`, when the address names one.
 */
function ReviewPlaceholder({
  message,
  lesson,
}: {
  readonly message?: string;
  readonly lesson?: LessonId;
}) {
  return (
    <Stage
      title={TITLE}
      header={{ place: { name: 'Review' }, back: back(lesson) }}
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
      // Holds the action bar's room while the review loads, so the board doesn't shrink when it comes.
      programFoot={message ? undefined : <View />}
    />
  );
}

const styles = StyleSheet.create({ placeholder: { minHeight: 200 } });
