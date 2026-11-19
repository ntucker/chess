import Ionicons from '@expo/vector-icons/Ionicons';
import { Badge, Button, Pressable, Stack, Text, useTheme } from '@reactive/silk-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Eyebrow } from '@/components/Eyebrow';
import { Transport } from '@/components/Transport';
import type { Color } from '@/game/replay';
import { ideaTone, type PlayedBack } from '@/lesson/drawings';
import type { Evaluation, Idea } from '@/lesson/lesson';
import type { Playback } from '@/lesson/useLesson';
import type { ShownNote } from '@/lesson/view';
import { toneColors } from '@/theme/drawingTones';
import type { Tone } from '@/board/drawing';

interface Props {
  readonly title: string;
  readonly notes: readonly ShownNote[];
  /** The learner's side: a note's kind takes its color from the board's drawings. */
  readonly learner: Color;
  /** Plays a note's plan, line or trap through on the board. */
  readonly playback: Playback;
}

/**
 * What the guide says about the position, or about the move being previewed:
 * each note's kind, its sentence, the study's own words behind "More", the
 * study's verdict, and a play-through for a plan, a line or a trap.
 */
export function IdeaCard({ title, notes, learner, playback }: Props) {
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
              learner={learner}
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

function NoteView({
  shown,
  learner,
  playback,
}: {
  readonly shown: ShownNote;
  readonly learner: Color;
  readonly playback: Playback;
}) {
  const { note } = shown;
  const [more, setMore] = useState(false);
  // The kind of the note's first drawn idea; none for text or a verdict alone.
  const kind = note.ideas?.find((idea) => idea.type !== 'evaluation');
  const verdict = note.ideas?.find((idea) => idea.type === 'evaluation')?.value;
  const playing = playback.playing?.note === note ? playback.playing : undefined;
  const original = note.original && note.original !== note.text ? note.original : undefined;
  const playable = playback.playable(shown);

  return (
    <Stack gap="2">
      {kind || verdict ? (
        <View style={styles.heading}>
          {kind ? <KindTag label={KINDS[kind.type]} tone={ideaTone(kind, learner)} /> : <View />}
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
  goto,
  stop,
}: {
  readonly playing: NonNullable<Playback['playing']>;
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
    <Badge variant="outline" size="sm" accessible accessibilityLabel={`The study's verdict: ${words}`}>
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
  notes: { borderLeftWidth: 2, paddingLeft: 14, gap: 16 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  kind: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  actions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
  more: { paddingVertical: 4 },
  moreText: { textDecorationLine: 'underline' },
  playing: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  count: { minWidth: 48 },
});
