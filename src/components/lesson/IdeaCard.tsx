import Ionicons from '@expo/vector-icons/Ionicons';
import { a11yState, Badge, Button, Pressable, Stack, Text, useTheme } from '@reactive/silk-native';
import { type FocusEvent as ReactFocusEvent, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { Tone } from '@/board/drawing';
import { hovers } from '@/board/pointer';
import { Eyebrow, useLabelled } from '@/components/Eyebrow';
import { Transport } from '@/components/Transport';
import type { Color } from '@/game/replay';
import { ideaTone } from '@/lesson/drawings';
import type { PlayedBack } from '@/lesson/guidance';
import type { Evaluation, Idea, Note } from '@/lesson/lesson';
import type { Playback, Playing } from '@/lesson/useLesson';
import type { ShownNote } from '@/lesson/view';
import { toneColors } from '@/theme/drawingTones';
import { NarrowOnly, useNarrowPart } from '@/theme/Narrow';

interface Props {
  readonly title: string;
  readonly notes: readonly ShownNote[];
  /** The learner's side: a note's kind takes its color from the board's drawings. */
  readonly learner: Color;
  /** Plays a note's plan, line or trap through on the board. */
  readonly playback: Playback;
  /** The notes whose ideas draw on the board when pointed at. */
  readonly pointable: readonly Note[];
  /** The note pointed at, whose ideas the board draws. */
  readonly pointed?: Note;
  /** The learner points at a note that draws on the board. */
  readonly onPoint: (note: Note) => void;
  /** The learner lets a note go: the mouse leaves it, or a second tap. */
  readonly onLeave: (note: Note) => void;
  /** The mouse comes onto the card at `time` (its event's time stamp). */
  readonly onReach: (time: number) => void;
}

/**
 * What the guide says about the position, or about the move being previewed:
 * each note's kind, its sentence, the study's own words behind "More", the
 * study's verdict, and a play-through for a plan, a line or a trap. A note
 * whose idea is on the board, pointed at or playing back, lights its rule in
 * that idea's color.
 */
export function IdeaCard({
  title,
  notes,
  learner,
  playback,
  pointable,
  pointed,
  onPoint,
  onLeave,
  onReach,
}: Props) {
  const labelled = useLabelled();
  return (
    <Stack
      style={labelled}
      onPointerEnter={({ nativeEvent, timeStamp }) => {
        if (hovers(nativeEvent.pointerType)) onReach(timeStamp);
      }}
    >
      <Eyebrow>{title}</Eyebrow>
      {notes.length ? (
        <View>
          {notes.map((shown) => (
            <NoteView
              // A position's notes differ as a whole (merge.ts drops exact repeats), not always in text.
              key={JSON.stringify(shown.note) + (shown.before ?? '')}
              shown={shown}
              learner={learner}
              playback={playback}
              pointable={pointable.includes(shown.note)}
              pointed={shown.note === pointed}
              onPoint={onPoint}
              onLeave={onLeave}
            />
          ))}
        </View>
      ) : (
        <Text role="bodySm" tone="secondary">
          No notes here. Point at a move to see what it aims for.
        </Text>
      )}
    </Stack>
  );
}

/** A word in the idea card's place where there are no ideas, under a heading as the card's. */
export function IdeaAside({ title, text }: { readonly title: string; readonly text: string }) {
  const labelled = useLabelled();
  return (
    <Stack style={labelled}>
      <Eyebrow>{title}</Eyebrow>
      <Text role="body" tone="secondary">
        {text}
      </Text>
    </Stack>
  );
}

export function NoteView({
  shown,
  learner,
  playback,
  pointable,
  pointed,
  onPoint,
  onLeave,
}: {
  readonly shown: ShownNote;
  readonly learner: Color;
  readonly playback: Playback;
  readonly pointable: boolean;
  readonly pointed: boolean;
  readonly onPoint: (note: Note) => void;
  readonly onLeave: (note: Note) => void;
}) {
  const { theme } = useTheme();
  const { color } = theme.semantic;
  const { note } = shown;
  const [more, setMore] = useState(false);
  // The note's first drawn idea, which names its kind; none for text or a verdict alone.
  const drawn = note.ideas?.find((idea) => idea.type !== 'evaluation');
  const verdict = note.ideas?.find((idea) => idea.type === 'evaluation')?.value;
  const playing = playback.playing?.note === note ? playback.playing : undefined;
  const original = note.original && note.original !== note.text ? note.original : undefined;
  const playable = playback.playable(shown);
  // The idea on the board, whose color lights the rule: the one playing back,
  // or while pointed at, the note's first.
  const litIdea = playing ? playing.idea : pointed ? drawn : undefined;
  const point = () => {
    if (pointable && !pointed) onPoint(note);
  };
  // Keyboard focus on its buttons points at it too; the panel ends it. Focus
  // from a tap or click on a button doesn't, so Play keeps the pointing it
  // started from: the pointer has its own rules.
  const focus = (event: unknown) => {
    const { target } = event as ReactFocusEvent<Element>;
    if (target.matches(':focus-visible')) point();
  };
  const part = useNarrowPart();
  const heading =
    drawn || verdict ? (
      <View style={styles.heading}>
        {drawn ? <KindTag label={KINDS[drawn.type]} tone={ideaTone(drawn, learner)} /> : <View />}
        {verdict ? <Verdict value={verdict} /> : null}
      </View>
    ) : null;
  // On a narrow page a verdict with no kind beside it goes below the words, which come first.
  const verdictBelow = !drawn && Boolean(verdict);

  return (
    <Stack
      gap="2"
      onPointerEnter={({ nativeEvent }) => {
        if (hovers(nativeEvent.pointerType)) point();
      }}
      onPointerLeave={({ nativeEvent }) => {
        // Whether lit or not: a switch may hide the ideas of the note pointed at.
        if (hovers(nativeEvent.pointerType)) onLeave(note);
      }}
      // Only the web has keyboard focus here.
      onFocus={process.env.EXPO_OS === 'web' ? focus : undefined}
      style={[
        styles.note,
        {
          borderTopRightRadius: theme.semantic.radius.sm,
          borderBottomRightRadius: theme.semantic.radius.sm,
        },
        litIdea
          ? {
              borderColor: toneColors[ideaTone(litIdea, learner)],
              backgroundColor: color.tones.neutral.subtle,
            }
          : { borderColor: color.tones.accent.solid },
      ]}
    >
      <Stack
        gap="2"
        // On a touch screen a tap on the note's words points at it, and another
        // lets it go, so the candidates' arrows come back. Its buttons don't
        // toggle it, so Play keeps the pointing it started from. A scroll
        // cancels the pointer, so it points at nothing.
        onPointerUp={({ nativeEvent }) => {
          if (hovers(nativeEvent.pointerType)) return;
          if (pointed) onLeave(note);
          else point();
        }}
      >
        {verdictBelow ? <View {...part('wide-only')}>{heading}</View> : heading}
        <Text role="body">{note.text}</Text>
        {verdictBelow ? <NarrowOnly>{heading}</NarrowOnly> : null}
        {more && original ? (
          <Text role="bodySm" tone="secondary">
            {original}
          </Text>
        ) : null}
      </Stack>
      {original || playable || note.generated ? (
        <View style={styles.actions}>
          {playing ? (
            <PlayingControls playing={playing} goto={playback.goto} stop={playback.stop} />
          ) : playable ? (
            <Button size="sm" variant="soft" tone="accent" onPress={() => playback.play(shown)}>
              <Ionicons name="play" size={13} />
              {` ${PLAY[playable]}`}
            </Button>
          ) : null}
          {original ? (
            <Pressable
              accessibilityRole="button"
              {...a11yState({ expanded: more })}
              onPress={() => setMore(!more)}
              style={styles.more}
            >
              <Text role="caption" tone="secondary" style={styles.moreText}>
                {more ? 'Less' : 'The study’s words'}
              </Text>
            </Pressable>
          ) : null}
          {note.generated ? (
            // No guide explains this move: the importer's AI wrote its idea.
            <Text role="caption" tone="secondary" style={styles.more}>
              Opening Night’s note, not the guide’s
            </Text>
          ) : null}
        </View>
      ) : null}
    </Stack>
  );
}

/** Steps through the idea playing on the board, with where it stands and a way out. */
function PlayingControls({
  playing: { step, steps },
  goto,
  stop,
}: {
  readonly playing: Playing;
} & Pick<Playback, 'goto' | 'stop'>) {
  const { theme } = useTheme();
  return (
    <View style={styles.playing}>
      <Transport ply={step} total={steps - 1} onGoto={goto} />
      <Text role="caption" tone="secondary" style={styles.count}>
        {step === 0 ? 'Start' : `${step} of ${steps - 1}`}
      </Text>
      <Button size="sm" variant="ghost" accessibilityLabel="Back to the game" onPress={stop}>
        <Ionicons name="close" size={18} color={theme.semantic.color.textPrimary} />
      </Button>
    </View>
  );
}

/** The kind of idea a note teaches, named and colored as the board draws it. */
function KindTag({ label, tone }: { readonly label: string; readonly tone: Tone }) {
  return (
    <View style={styles.kind}>
      <View style={[styles.dot, { backgroundColor: toneColors[tone] }]} />
      <Eyebrow>{label}</Eyebrow>
    </View>
  );
}

/** The study's verdict on the position: its glyph and a few words. */
function Verdict({ value }: { readonly value: Evaluation }) {
  const { glyph, words } = VERDICTS[value];
  return (
    <Badge
      variant="outline"
      size="sm"
      accessible
      accessibilityLabel={`The study's verdict: ${words}`}
    >
      {`${glyph}  ${words}`}
    </Badge>
  );
}

/** The play-through button of each kind that plays back. */
const PLAY: Readonly<Record<PlayedBack['type'], string>> = {
  plan: 'Play the plan',
  line: 'Play the line',
  trap: 'Play the trap',
};

/** Each kind's name. */
const KINDS: Readonly<Record<Exclude<Idea['type'], 'evaluation'>, string>> = {
  purpose: 'What it does',
  pressure: 'Pressure',
  plan: 'Plan',
  threat: 'Threat',
  trap: 'Trap',
  line: 'Line',
  structure: 'Pawn structure',
  imbalance: 'Imbalance',
};

const VERDICTS: Readonly<Record<Evaluation, { glyph: string; words: string }>> = {
  equal: { glyph: '=', words: 'Equal' },
  whiteSlightly: { glyph: '⩲', words: 'White a little better' },
  whiteClearly: { glyph: '±', words: 'White better' },
  whiteWinning: { glyph: '+−', words: 'White winning' },
  blackSlightly: { glyph: '⩱', words: 'Black a little better' },
  blackClearly: { glyph: '∓', words: 'Black better' },
  blackWinning: { glyph: '−+', words: 'Black winning' },
};

const styles = StyleSheet.create({
  // Each note carries its piece of the rule, so a pointed one can light its own.
  note: {
    borderLeftWidth: 2,
    paddingLeft: 14,
    paddingRight: 8,
    paddingVertical: 8,
  },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  kind: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  actions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
  more: { paddingVertical: 4 },
  moreText: { textDecorationLine: 'underline' },
  playing: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  count: { minWidth: 48 },
});
