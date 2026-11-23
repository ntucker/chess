import { Text } from '@reactive/silk-native';
import { View } from 'react-native';

import { Eyebrow } from '@/components/Eyebrow';
import { Disc } from '@/components/PlayerBar';
import { type Color, opposite } from '@/game/replay';
import type { Review } from '@/review/useReview';
import { PLAYER_DISC } from '@/theme/sideBySide';
import { narrowStyles } from '@/theme/narrow';
import { useNarrowStyles } from '@/theme/Narrow';

import { AccuracyMark } from './Accuracy';

/**
 * A narrow page's one bar of both players, above the board: the opponent at
 * its start and the learner at its end, each by their disc, and once the
 * game is checked, each one's accuracy beside their name. Each disc sits
 * in the column of the evaluation bar's, as the name bars' do.
 */
export function ReviewNames({
  learner,
  accuracy,
}: {
  readonly learner: Color;
  readonly accuracy: Review['accuracy'];
}) {
  const styles = useNarrowStyles(STYLES);
  const rival = opposite(learner);
  const known = [accuracy[rival], accuracy[learner]].some((side) => typeof side === 'number');
  return (
    <View style={styles.bar}>
      <Disc color={rival} toMove={false} />
      <Text role="headingSm" numberOfLines={1} style={styles.name}>
        Opponent
      </Text>
      <AccuracyMark accuracy={accuracy[rival]} whose="The opponent's" />
      {/* Takes the room between, pushing the learner to the end. */}
      <View style={styles.between}>{known ? <Eyebrow>Accuracy</Eyebrow> : null}</View>
      <AccuracyMark accuracy={accuracy[learner]} whose="Your" />
      <Text role="headingSm" numberOfLines={1}>
        You
      </Text>
      <Disc color={learner} toMove={false} />
    </View>
  );
}

const STYLES = narrowStyles((px) => ({
  bar: { height: '100%', flexDirection: 'row', alignItems: 'center', gap: px(PLAYER_DISC.gap) },
  name: { flexShrink: 1, minWidth: 0 },
  between: { flex: 1, alignItems: 'center' },
}));
