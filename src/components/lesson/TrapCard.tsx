import Ionicons from '@expo/vector-icons/Ionicons';
import { Button } from '@reactive/silk-native';
import { StyleSheet, View } from 'react-native';

import { type Color, colorName } from '@/game/replay';
import type { Lesson } from '@/lesson/lesson';
import type { Playback } from '@/lesson/useLesson';
import type { LandedTrap } from '@/lesson/view';

import { PastNote } from './IdeaCard';
import { ToneCard } from './ToneCard';

interface Props {
  readonly lesson: Lesson;
  readonly trap: LandedTrap;
  /** The tempting move, as the scoresheet writes it: "Nxe5". */
  readonly mistake: string;
  /** Who made the tempting move. */
  readonly fell: Color;
  readonly learner: Color;
  /** Plays the whole trap through on the board. */
  readonly playback: Playback;
  /** Shows the position before the tempting move, to try another. */
  readonly onBack: () => void;
}

/**
 * A trap the line fell into, explained once its punishment lands: who fell
 * for which move, the guide's note on it with its play-through, and a way
 * back to before the mistake.
 */
export function TrapCard({ lesson, trap, mistake, fell, learner, playback, onBack }: Props) {
  const yours = fell === learner;
  return (
    <ToneCard
      tone="danger"
      heading={{
        icon: 'warning',
        title: yours
          ? `${mistake} walked into a trap.`
          : `${colorName(fell)} fell for it with ${mistake}.`,
      }}
    >
      <PastNote lesson={lesson} shown={trap.note} learner={learner} playback={playback} />
      {yours ? (
        <View style={styles.back}>
          <Button size="sm" variant="ghost" tone="danger" onPress={onBack}>
            <Ionicons name="arrow-undo" size={13} />
            {' Back to before the mistake'}
          </Button>
        </View>
      ) : null}
    </ToneCard>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row' },
});
