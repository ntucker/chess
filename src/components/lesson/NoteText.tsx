import { Text, Tooltip, useTheme } from '@reactive/silk-native';
import { type ReactNode, useMemo } from 'react';
import { Platform, StyleSheet } from 'react-native';

import { MiniBoard } from '@/components/MiniBoard';
import { Notation } from '@/components/Notation';
import type { Color } from '@/game/replay';
import type { Lesson } from '@/lesson/lesson';
import { type Mention, noteParts } from '@/lesson/mentions';
import type { ShownNote } from '@/lesson/view';
import type { Density } from '@/theme/Narrow';
import { fonts } from '@/theme/theme';

/** One square's width on a mention's board: 176 points across. */
const SQUARE_SIZE = 22;
/** How long a resting mouse waits before a mention's board shows: quicker than a tooltip's words. */
const DELAY_MS = 250;

interface Props {
  readonly lesson: Lesson;
  readonly shown: ShownNote;
  /** The side at the bottom of each mention's board. */
  readonly learner: Color;
  /** What runs in before the sentence, such as a compact card's title. */
  readonly lead?: ReactNode;
  /** `compact` sets the sentence a size down, for a phone's pane. */
  readonly density: Density;
}

// Natively a trigger inside a line of text is a span, which has no padding:
// thin spaces inside its background stand in for the chip's.
const PAD = Platform.OS === 'web' ? '' : '\u2009';

/**
 * A note's sentence, with each move or square it names (`noteParts`) set as
 * notation that shows it on a small board: under a resting mouse, or on a
 * tap. A tap there, or on the board, doesn't point at the note.
 */
export function NoteText({ lesson, shown, learner, lead, density }: Props) {
  const { note, after, before } = shown;
  // A preview builds its shown notes anew on every render, so this keys on their fields.
  const parts = useMemo(
    () => noteParts(lesson, { note, after, before }),
    [lesson, note, after, before],
  );
  return (
    <Text role="body" style={density === 'compact' && styles.compact}>
      {lead}
      {parts.map((part, n) =>
        typeof part === 'string' ? part : <MentionTip key={n} mention={part} learner={learner} />,
      )}
    </Text>
  );
}

function MentionTip({ mention, learner }: { readonly mention: Mention; readonly learner: Color }) {
  const { theme } = useTheme();
  const { accent } = theme.semantic.color.tones;
  // The note's own tap points at it; a tap on the notation or its board, which
  // React bubbles to the note from the tooltip's layer too, only shows the board.
  const keepFromNote = (event: { stopPropagation: () => void }) => event.stopPropagation();
  return (
    <Tooltip.Root delayDuration={DELAY_MS}>
      <Tooltip.Trigger
        style={[styles.chip, { backgroundColor: accent.subtle }]}
        onPointerUp={keepFromNote}
      >
        <Text role="body" style={[styles.notation, { color: accent.text }]}>
          {PAD}
          <Notation>{mention.text}</Notation>
          {PAD}
        </Text>
      </Tooltip.Trigger>
      <Tooltip.Content style={styles.tip} onPointerUp={keepFromNote}>
        <MiniBoard
          position={mention.key}
          orientation={learner}
          lit={mention.lit}
          highlight={mention.kind === 'move' ? 'lastMove' : 'selected'}
          squareSize={SQUARE_SIZE}
        />
      </Tooltip.Content>
    </Tooltip.Root>
  );
}

const styles = StyleSheet.create({
  compact: { fontSize: 15, lineHeight: 22 },
  chip: { borderRadius: 4, paddingHorizontal: 3 },
  // Notation in the app's mono, a size down so it sits level with the words.
  notation: { fontFamily: fonts.mono, fontSize: 15 },
  tip: { padding: 4 },
});
