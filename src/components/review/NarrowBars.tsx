import { Text, useTheme } from '@reactive/silk-native';
import { StyleSheet, View } from 'react-native';

import { shownMove } from '@/components/lesson/ScoresheetDrawer';
import { Disc } from '@/components/PlayerBar';
import { stepButton } from '@/components/Transport';
import { type Color, opposite } from '@/game/replay';
import { PLAYER_DISC } from '@/theme/sideBySide';
import { narrowStyles } from '@/theme/narrow';
import { useNarrowStyles } from '@/theme/Narrow';
import { fonts } from '@/theme/theme';

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

/**
 * The narrow stepper's middle (`Transport`), where the graph of the game
 * will go: until then, the move on the board, "7…Qxb2", or "Start".
 */
export function GraphPlace({ san, ply }: { readonly san?: string; readonly ply: number }) {
  const { theme } = useTheme();
  return (
    <View style={styles.place}>
      <Text
        role="body"
        numberOfLines={1}
        style={[styles.move, { color: theme.semantic.color.textPrimary }]}
      >
        {shownMove(san, ply)}
      </Text>
    </View>
  );
}

const STYLES = narrowStyles((px) => ({
  bar: { height: '100%', flexDirection: 'row', alignItems: 'center', gap: px(PLAYER_DISC.gap) },
  // Takes the room between, pushing the learner's name to the end.
  name: { flex: 1, minWidth: 0 },
}));

const styles = StyleSheet.create({
  place: { ...stepButton, alignItems: 'center', justifyContent: 'center' },
  move: { fontFamily: fonts.mono, fontSize: 14 },
});
