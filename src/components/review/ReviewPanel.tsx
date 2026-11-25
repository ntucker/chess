import { Separator, Stack } from '@reactive/silk-native';
import { StyleSheet, View } from 'react-native';

import { useLabelled, useSections } from '@/components/Eyebrow';
import { Scoresheet, ScoresheetTitle } from '@/components/Scoresheet';
import type { Color } from '@/game/replay';
import type { LessonId } from '@/resources/lesson';

import { ReviewActions } from './ReviewActions';
import { ReviewGraph } from './ReviewGraph';
import { ReviewHeadline } from './ReviewHeadline';
import { ReviewCard } from './ReviewCard';
import { reviewScoresheet, type ReviewView } from './reviewView';

interface Props {
  /** What the headline's eyebrow names: "Review · Caro-Kann". */
  readonly eyebrow: string;
  /** The learner's side. */
  readonly learner: Color;
  readonly review: ReviewView;
  /** The lesson the game was played in, if any: "Play on from here" opens its page. */
  readonly lesson?: LessonId;
}

/**
 * The review's panel beside the board on a wide page: the headline, the
 * graph of the game, the move card for the move shown, the three actions,
 * and the scoresheet. A phone lays the same blocks out in pages under the
 * board instead (`PhoneReview`).
 */
export function ReviewPanel({ eyebrow, learner, review, lesson }: Props) {
  const labelled = useLabelled();
  const sections = useSections();
  const { plies, moves, ply, goto } = review;
  return (
    <Stack style={sections}>
      <ReviewHeadline eyebrow={eyebrow} learner={learner} review={review} />
      <View style={styles.graph}>
        <ReviewGraph review={review} learner={learner} height={GRAPH_HEIGHT} />
      </View>
      <ReviewCard learner={learner} review={review} lesson={lesson} />
      <ReviewActions {...review} />
      <Separator />
      <Stack style={labelled}>
        <ScoresheetTitle />
        <Scoresheet {...reviewScoresheet({ plies, moves, ply, goto })} />
      </Stack>
    </Stack>
  );
}

/** The graph's height on a wide page. */
const GRAPH_HEIGHT = 72;

const styles = StyleSheet.create({ graph: { marginVertical: 12 } });
