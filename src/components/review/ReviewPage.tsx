import { AsyncBoundary, useSuspense } from '@data-client/react';
import { Spinner } from '@reactive/silk-native';
import { useIsFocused } from 'expo-router';
import { use } from 'react';
import { StyleSheet, View } from 'react-native';

import { lastMoveBadge, refutationArrow } from '@/board/drawing';
import { BrowserOnly } from '@/components/BrowserOnly';
import { StatusHeadline } from '@/components/GameStatus';
import { NewVersionPage } from '@/components/NewVersion';
import type { PhonePage } from '@/components/PhonePages';
import { ScoresheetOpener } from '@/components/ScoresheetPage';
import { BoardColumn, BoardColumnPlaceholder, Stage } from '@/components/Stage';
import { usePages } from '@/components/usePages';
import { NewVersionError } from '@/files/newVersion';
import { type Color, colorName, dropMove, fenAfter, opposite } from '@/game/replay';
import type { Uci } from '@/lesson/lesson';
import { lessonHref, withOpenings } from '@/lesson/openings';
import { getLesson, isLessonId, LessonIndexContext, type LessonId } from '@/resources/lesson';
import { addressMoves, type ReviewAddress } from '@/review/address';
import { REVIEW_ENGINE, useReview } from '@/review/useReview';
import { useLayout } from '@/theme/Narrow';

import { AccuracyMark } from './Accuracy';
import { PhoneReview } from './PhoneReview';
import { ReviewActionBar } from './ReviewActions';
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
  const played = addressMoves(moves);
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
  const phone = useLayout() === 'phone';
  const { page, show } = usePages<PhonePage<'review'>>('review', phone);
  const scoresheetShown = page === 'scoresheet';
  const eyebrow = picked ? `Review · ${picked.title}` : 'Review';
  return (
    <Stage
      title={TITLE}
      header={{
        place: picked ? { name: picked.title, parent: 'Review' } : { name: 'Review' },
        back: back(lesson),
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
            captures: review.captures,
          }}
          rival={{
            name: 'Opponent',
            detail: colorName(opposite(learner)),
            children: (
              <AccuracyMark
                accuracy={review.accuracy[opposite(learner)]}
                whose="The opponent's"
                named={!phone}
              />
            ),
          }}
          // A phone's bar under the board has no room beside the stepper:
          // the summary's verdict carries the learner's accuracy there.
          player={{
            children: phone ? null : (
              <AccuracyMark accuracy={review.accuracy[learner]} whose="Your" named />
            ),
          }}
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
          stepperMiddle={
            <ScoresheetOpener
              san={plies[ply].move?.san}
              ply={ply}
              open={scoresheetShown}
              onToggle={() => show(scoresheetShown ? 'review' : 'scoresheet')}
            />
          }
        />
      }
      program={
        phone ? (
          <PhoneReview
            eyebrow={eyebrow}
            learner={learner}
            review={review}
            lesson={lesson}
            page={page}
            onPage={show}
          />
        ) : (
          <ReviewPanel eyebrow={eyebrow} learner={learner} review={review} lesson={lesson} />
        )
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
