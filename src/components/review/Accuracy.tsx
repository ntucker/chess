import { Text } from '@reactive/silk-native';
import { StyleSheet, View } from 'react-native';

import { Eyebrow } from '@/components/Eyebrow';
import { Tip } from '@/components/Tip';
import { accuracyWords } from '@/review/accuracy';
import type { Review } from '@/review/useReview';
import { fonts } from '@/theme/theme';

interface Props {
  /** The side's accuracy (`gameAccuracy`): shown only once it's a number. */
  readonly accuracy: Review['accuracy']['white'];
  /** Whose it is, for its tooltip: "Your", "The opponent's". */
  readonly whose: string;
  /** Named "Accuracy" before the number, on a wide page's name bar; a phone's bar has no room, and its tip names it. */
  readonly named?: boolean;
}

/**
 * A side's accuracy in its name bar, once the whole game is checked: the
 * number, rounded, with what it means in a tooltip. Nothing before then,
 * nor for a side with too few judged moves to count.
 */
export function AccuracyMark({ accuracy, whose, named }: Props) {
  if (typeof accuracy !== 'number') return null;
  const shown = Math.round(accuracy);
  return (
    <Tip
      tip={`${accuracyWords(whose, accuracy)}, from how much of the winning chances each judged move gave away. Book and forced moves, and moves that couldn't be checked, don't count.`}
      focusable
    >
      <View style={styles.mark}>
        {named ? <Eyebrow>Accuracy</Eyebrow> : null}
        <Text role={named ? 'heading' : 'headingSm'} style={styles.number}>
          {shown}
        </Text>
      </View>
    </Tip>
  );
}

const styles = StyleSheet.create({
  mark: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  number: { fontFamily: fonts.mono, fontVariant: ['tabular-nums'] },
});
