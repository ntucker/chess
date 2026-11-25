import { StyleSheet } from 'react-native';

import type { Color } from '@/game/replay';
import { PhonePages } from '@/components/PhonePages';
import { useSections } from '@/components/Eyebrow';
import type { LessonId } from '@/resources/lesson';
import { FadingScroll } from '@/theme/Narrow';

import { ReviewGraph } from './ReviewGraph';
import { ReviewHeadline } from './ReviewHeadline';
import { ReviewMoment } from './ReviewMoment';
import { reviewScoresheet, type ReviewView } from './reviewView';

/** The pages under the board on a phone, side by side: the review of the move shown, and the scoresheet. */
export type PhoneReviewPage = 'review' | 'scoresheet';

/**
 * The review under the board on a phone: its headline over two pages
 * (`PhonePages`). One holds a thin graph of the game over the move card,
 * scrolling on its own; the other is the scoresheet. The actions sit at the
 * screen's foot (`ReviewActionBar`).
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
  readonly page: PhoneReviewPage;
  readonly onPage: (page: PhoneReviewPage) => void;
}) {
  const sections = useSections();
  const { plies, moves, ply, goto } = review;
  return (
    <PhonePages
      head={<ReviewHeadline eyebrow={eyebrow} learner={learner} review={review} />}
      home="review"
      page={page}
      onPage={onPage}
      scoresheet={reviewScoresheet({ plies, moves, ply, goto })}
    >
      <FadingScroll style={styles.pane} contentStyle={sections}>
        <ReviewGraph review={review} learner={learner} height={GRAPH_HEIGHT} />
        <ReviewMoment learner={learner} review={review} lesson={lesson} />
      </FadingScroll>
    </PhonePages>
  );
}

/** The graph's height: thin, to leave the move card its room. */
const GRAPH_HEIGHT = 40;

const styles = StyleSheet.create({
  // Takes its page's height and no more, so what it holds scrolls within.
  pane: { flexGrow: 1, flexShrink: 1, minHeight: 0 },
});
