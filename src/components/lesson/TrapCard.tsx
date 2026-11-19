import Ionicons from '@expo/vector-icons/Ionicons';
import { Button, Stack, Surface, Text, useTheme } from '@reactive/silk-native';
import { StyleSheet, View } from 'react-native';

import { type Color, colorName } from '@/game/replay';
import type { Playback } from '@/lesson/useLesson';
import type { LandedTrap } from '@/lesson/view';

import { NoteView } from './IdeaCard';

interface Props {
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
export function TrapCard({ trap, mistake, fell, learner, playback, onBack }: Props) {
  const { theme } = useTheme();
  const danger = theme.semantic.color.tones.danger;
  const yours = fell === learner;
  return (
    <Surface
      radius="md"
      border="subtle"
      style={[styles.card, { borderColor: danger.border, backgroundColor: danger.subtle }]}
    >
      <Stack gap="3">
        <View style={styles.heading}>
          <Ionicons name="warning" size={18} color={danger.text} />
          <Text role="headingSm" style={styles.title}>
            {yours
              ? `${mistake} walked into a trap.`
              : `${colorName(fell)} fell for it with ${mistake}.`}
          </Text>
        </View>
        {/* Its ideas are about the position before the mistake, so pointing draws nothing. */}
        <NoteView
          shown={trap.note}
          learner={learner}
          playback={playback}
          pointable={false}
          pointed={false}
          onPoint={() => undefined}
          onLeave={() => undefined}
        />
        {yours ? (
          <View style={styles.back}>
            <Button size="sm" variant="ghost" tone="danger" onPress={onBack}>
              <Ionicons name="arrow-undo" size={13} />
              {' Back to before the mistake'}
            </Button>
          </View>
        ) : null}
      </Stack>
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { flexShrink: 1 },
  back: { flexDirection: 'row' },
});
