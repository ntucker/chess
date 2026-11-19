import Ionicons from '@expo/vector-icons/Ionicons';
import { Button, Pressable, Stack, Text, useTheme } from '@reactive/silk-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { Tone } from '@/board/drawing';
import { Eyebrow } from '@/components/Eyebrow';
import { Transport } from '@/components/Transport';
import type { Evaluation, Idea, Note } from '@/lesson/lesson';
import type { Playback } from '@/lesson/useLesson';
import type { ShownNote } from '@/lesson/view';
import { toneColors } from '@/theme/drawingTones';

interface Props {
  readonly title: string;
  readonly notes: readonly ShownNote[];
  /** Plays a note's plan, line or trap through on the board. */
  readonly playback: Playback;
}

/**
 * What the guide says about the position, or about the move being previewed:
 * each note's kind, its sentence, the study's own words behind "More", the
 * study's verdict, and a play-through for a plan, a line or a trap.
 */
export function IdeaCard({ title, notes, playback }: Props) {
  const { theme } = useTheme();
  const { color } = theme.semantic;
  return (
    <Stack gap="3">
      <Eyebrow>{title}</Eyebrow>
      {notes.length ? (
        <View style={[styles.notes, { borderColor: color.tones.accent.solid }]}>
          {notes.map((shown) => (
            <NoteView
              key={shown.note.text + (shown.before ?? '')}
              shown={shown}
              playback={playback}
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

function NoteView({ shown, playback }: { readonly shown: ShownNote; readonly playback: Playback }) {
  const { note } = shown;
  const [more, setMore] = useState(false);
  const kind = noteKind(note);
  const verdict = note.ideas?.find((idea) => idea.type === 'evaluation')?.value;
  const playing = playback.playing?.note === note ? playback.playing : undefined;
  const original = note.original && note.original !== note.text ? note.original : undefined;
  const playable = playback.playable(shown)?.type;

  return (
    <Stack gap="2">
      {kind || verdict ? (
        <View style={styles.heading}>
          {kind ? <KindTag {...KINDS[kind]} /> : <View />}
          {verdict ? <Verdict value={verdict} /> : null}
        </View>
      ) : null}
      <Text role="body">{note.text}</Text>
      {more && original ? (
        <Text role="bodySm" tone="secondary">
          {original}
        </Text>
      ) : null}
      {original || playable ? (
        <View style={styles.actions}>
          {playing ? (
            <PlayingControls playing={playing} playback={playback} />
          ) : playable ? (
            <Button size="sm" variant="soft" tone="accent" onPress={() => playback.play(shown)}>
              <Ionicons name="play" size={13} />
              {` ${PLAY[playable as keyof typeof PLAY]}`}
            </Button>
          ) : null}
          {original ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: more }}
              onPress={() => setMore(!more)}
              style={styles.more}
            >
              <Text role="caption" tone="secondary" style={styles.moreText}>
                {more ? 'Less' : 'The study’s words'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </Stack>
  );
}

/** Steps through the idea playing on the board, with where it stands and a way out. */
function PlayingControls({
  playing: { step, steps },
  playback,
}: {
  readonly playing: NonNullable<Playback['playing']>;
  readonly playback: Playback;
}) {
  const { theme } = useTheme();
  const { color } = theme.semantic;
  return (
    <View style={styles.playing}>
      <Transport ply={step} total={steps - 1} onGoto={playback.goto} />
      <Text role="caption" tone="secondary" style={styles.count}>
        {step === 0 ? 'Start' : `${step} of ${steps - 1}`}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to the game"
        onPress={playback.stop}
        style={({ hovered, pressed }) => [
          styles.close,
          (hovered || pressed) && { backgroundColor: color.tones.neutral.subtle },
        ]}
      >
        <Ionicons name="close" size={18} color={color.textPrimary} />
      </Pressable>
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
  const { theme } = useTheme();
  const { color } = theme.semantic;
  const { glyph, words } = VERDICTS[value];
  return (
    <View
      accessible
      accessibilityLabel={`The study's verdict: ${words}`}
      style={[styles.verdict, { borderColor: color.borderSubtle }]}
    >
      <Text role="caption" style={styles.glyph}>
        {glyph}
      </Text>
      <Text role="caption" tone="secondary">
        {words}
      </Text>
    </View>
  );
}

type Kind = Exclude<Idea['type'], 'evaluation'>;

/** The play-through button of each kind that plays back. */
const PLAY = { plan: 'Play the plan', line: 'Play the line', trap: 'Play the trap' } as const;

/** Each kind's name, and the tone its drawings lead with. */
const KINDS: Readonly<Record<Kind, { label: string; tone: Tone }>> = {
  purpose: { label: 'What it does', tone: 'main' },
  pressure: { label: 'Pressure', tone: 'target' },
  plan: { label: 'Plan', tone: 'plan' },
  threat: { label: 'Threat', tone: 'danger' },
  trap: { label: 'Trap', tone: 'danger' },
  line: { label: 'Line', tone: 'main' },
  structure: { label: 'Pawn structure', tone: 'other' },
  imbalance: { label: 'Imbalance', tone: 'other' },
};

/** The kind of the note's first drawn idea; none for text or a verdict alone. */
const noteKind = (note: Note): Kind | undefined =>
  note.ideas?.find((idea): idea is Extract<Idea, { type: Kind }> => idea.type !== 'evaluation')
    ?.type;

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
  notes: { borderLeftWidth: 2, paddingLeft: 14, gap: 16 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  kind: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  verdict: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  glyph: { fontWeight: '700' },
  actions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
  more: { paddingVertical: 4 },
  moreText: { textDecorationLine: 'underline' },
  playing: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  count: { minWidth: 48 },
  close: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
