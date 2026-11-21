import { Text, Tooltip, useTheme } from '@reactive/silk-native';
import { useMemo } from 'react';
import { StyleSheet } from 'react-native';

import { MiniBoard } from '@/components/MiniBoard';
import type { Color } from '@/game/replay';
import type { Lesson } from '@/lesson/lesson';
import { type Mention, noteParts } from '@/lesson/mentions';
import type { ShownNote } from '@/lesson/view';
import { fonts } from '@/theme/theme';

/** One square's width on a mention's board: 176 points across. */
const SQUARE = 22;
/** How long a resting mouse waits before a mention's board shows: quicker than a tooltip's words. */
const DELAY_MS = 250;

interface Props {
  readonly lesson: Lesson;
  readonly shown: ShownNote;
  /** The side at the bottom of each mention's board. */
  readonly learner: Color;
}

/**
 * A note's sentence, with each move or square it names (`noteParts`) set as
 * notation that shows it on a small board: under a resting mouse, or on a
 * tap. A tap there doesn't point at the note.
 */
export function NoteText({ lesson, shown, learner }: Props) {
  const parts = useMemo(() => noteParts(lesson, shown), [lesson, shown]);
  return (
    <Text role="body">
      {parts.map((part, n) =>
        typeof part === 'string' ? part : <MentionTip key={n} mention={part} learner={learner} />,
      )}
    </Text>
  );
}

function MentionTip({ mention, learner }: { readonly mention: Mention; readonly learner: Color }) {
  const { theme } = useTheme();
  const { accent } = theme.semantic.color.tones;
  return (
    <Tooltip.Root delayDuration={DELAY_MS}>
      <Tooltip.Trigger
        style={[styles.chip, { backgroundColor: accent.subtle }]}
        // The note's own tap points at it; a tap here only shows the board.
        onPointerUp={(event) => event.stopPropagation()}
      >
        <Text role="body" style={[styles.notation, { color: accent.text }]}>
          {mention.text}
        </Text>
      </Tooltip.Trigger>
      <Tooltip.Content style={styles.tip}>
        <MiniBoard
          position={mention.key}
          orientation={learner}
          lit={mention.lit}
          light={mention.kind === 'move' ? 'lastMove' : 'selected'}
          square={SQUARE}
        />
      </Tooltip.Content>
    </Tooltip.Root>
  );
}

const styles = StyleSheet.create({
  chip: { borderRadius: 4, paddingHorizontal: 3 },
  // Notation in the app's mono, a size down so it sits level with the words.
  notation: { fontFamily: fonts.mono, fontSize: 15 },
  tip: { padding: 4 },
});
