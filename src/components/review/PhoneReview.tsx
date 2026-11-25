import { StyleSheet } from 'react-native';

import { type PhonePage, PhonePages } from '@/components/PhonePages';
import type { Color } from '@/game/replay';
import type { LessonId } from '@/resources/lesson';
import { FadingScroll } from '@/theme/Narrow';

import { ReviewGraph } from './ReviewGraph';
import { ReviewCard } from './ReviewCard';
import { ReviewHeadline } from './ReviewHeadline';
import { reviewScoresheet, type ReviewView } from './reviewView';

/**
 * The review under the board on a phone: its headline and a thin graph of
 * the game over two pages (`PhonePages`), the move card, scrolling on its
 * own, and the scoresheet. The graph sits above the pages, so a sideways
 * drag on it scrubs rather than turns the page, and its bubble has the
 * headline's room above it. The actions sit at the screen's foot
 * (`ReviewActionBar`).
 */
export function PhoneReview({
  eyebrow,
  learner,
  review,
  lesson,
  page,
  onPage,
}: {
  readonly eyebrow: string;
  readonly learner: Color;
  readonly review: ReviewView;
  readonly lesson?: LessonId;
  readonly page: PhonePage<'review'>;
  readonly onPage: (page: PhonePage<'review'>) => void;
}) {
  const { plies, moves, ply, goto } = review;
  return (
    <PhonePages
      head={
        <>
          <ReviewHeadline eyebrow={eyebrow} learner={learner} review={review} />
          <ReviewGraph review={review} learner={learner} height={GRAPH_HEIGHT} />
        </>
      }
      home="review"
      page={page}
      onPage={onPage}
      scoresheet={reviewScoresheet({ plies, moves, ply, goto })}
    >
      <FadingScroll style={styles.pane}>
        <ReviewCard learner={learner} review={review} lesson={lesson} />
      </FadingScroll>
    </PhonePages>
  );
}

/** The graph's height: thin, to leave the move card its room. */
const GRAPH_HEIGHT = 32;

const styles = StyleSheet.create({
  // Takes its page's height and no more, so what it holds scrolls within.
  pane: { flexGrow: 1, flexShrink: 1, minHeight: 0 },
});
