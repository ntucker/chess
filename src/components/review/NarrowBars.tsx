import { Text } from '@reactive/silk-native';
import { View } from 'react-native';

import { Disc } from '@/components/PlayerBar';
import { type Color, opposite } from '@/game/replay';
import { PLAYER_DISC } from '@/theme/sideBySide';
import { narrowStyles } from '@/theme/narrow';
import { useNarrowStyles } from '@/theme/Narrow';

/**
 * A narrow page's one bar of both players, above the board: the opponent at
 * its start and the learner at its end, each by their disc. Each disc sits
 * in the column of the evaluation bar's, as the name bars' do.
 */
export function ReviewNames({ learner }: { readonly learner: Color }) {
  const styles = useNarrowStyles(STYLES);
  return (
    <View style={styles.bar}>
      <Disc color={opposite(learner)} toMove={false} />
      <Text role="headingSm" numberOfLines={1} style={styles.name}>
        Opponent
      </Text>
      <Text role="headingSm" numberOfLines={1}>
        You
      </Text>
      <Disc color={learner} toMove={false} />
    </View>
  );
}

const STYLES = narrowStyles((px) => ({
  bar: { height: '100%', flexDirection: 'row', alignItems: 'center', gap: px(PLAYER_DISC.gap) },
  // Takes the room between, pushing the learner's name to the end.
  name: { flex: 1, minWidth: 0 },
}));
