import Ionicons from '@expo/vector-icons/Ionicons';
import { a11yState, Badge, Button, Pressable, Stack, Text, useTheme } from '@reactive/silk-native';
import { type FocusEvent as ReactFocusEvent, type ReactNode, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { EngineVerdict } from '@/analysis/quality';
import type { Tone } from '@/board/drawing';
import { hovers } from '@/board/pointer';
import { Eyebrow, useLabelled } from '@/components/Eyebrow';
import { Notation } from '@/components/Notation';
import { verdictText } from '@/components/QualityBadge';
import { Tip } from '@/components/Tip';
import { Transport } from '@/components/Transport';
import type { Color } from '@/game/replay';
import { ideaTone } from '@/lesson/drawings';
import type { PlayedBack } from '@/lesson/guidance';
import { AI_MODELS, type AiModel, type Evaluation, type Lesson } from '@/lesson/lesson';
import type { BoardIdea, BoardNote } from '@/lesson/mistakes';
import type { Playback, Playing } from '@/lesson/useLesson';
import type { ShownNote } from '@/lesson/view';
import { toneColors } from '@/theme/drawingTones';
import type { Density } from '@/theme/Narrow';
import { fonts } from '@/theme/theme';

import { NoteText } from './NoteText';

interface Props {
  /** The lesson the notes come from, which places the moves they name. */
  readonly lesson: Lesson;
  readonly title: string;
  /** Where the move previewed leads, which a compact card's lead names after `title`. */
  readonly leadsTo?: string;
  readonly notes: readonly ShownNote[];
  /** What the card says when it has no notes, in place of a hint to point at a move. */
  readonly empty?: string;
  /** The learner's side: a note's kind takes its color from the board's drawings. */
  readonly learner: Color;
  /** Plays a note's plan, line or trap through on the board. */
  readonly playback: Playback;
  /** The notes whose ideas draw on the board when pointed at. */
  readonly pointable: readonly BoardNote[];
  /** The note pointed at, whose ideas the board draws. */
  readonly pointed?: BoardNote;
  /** The learner points at a note that draws on the board. */
  readonly onPoint: (note: BoardNote) => void;
  /** The learner lets a note go: the mouse leaves it, or a second tap. */
  readonly onLeave: (note: BoardNote) => void;
  /** The mouse comes onto the card at `time` (its event's time stamp). */
  readonly onReach: (time: number) => void;
  /**
   * `compact`, a phone's pane: the title leads the first note's words in
   * the accent's italic, and the notes go without their rule, as a hairline
   * beside the pane stands in for it. `comfortable`: the title heads the
   * card, and each note has its rule.
   */
  readonly density: Density;
}

/**
 * What the guide says about the position, or about the move being previewed:
 * each note's kind, its sentence, the study's own words behind "More", the
 * study's verdict, a play-through for a plan, a line or a trap, and a mark
 * naming the AI model that wrote it where no guide explains the move. A note
 * whose idea is on the board, pointed at or playing back, lights its rule in
 * that idea's color.
 */
export function IdeaCard({
  lesson,
  title,
  leadsTo,
  notes,
  empty = 'No notes here. Point at a move to see what it aims for.',
  learner,
  playback,
  pointable,
  pointed,
  onPoint,
  onLeave,
  onReach,
  density,
}: Props) {
  const labelled = useLabelled();
  const compact = density === 'compact';
  // "If ♞f6 (Masi Variation):", before the first note's words.
  const lead = compact ? <Lead>{`${title}${leadsTo ? ` (${leadsTo})` : ''}: `}</Lead> : undefined;
  // With no notes the card names the move itself ("No notes on g6"), so leads only to say where it goes.
  const emptyLead = leadsTo ? lead : undefined;
  return (
    <Stack
      style={compact ? undefined : labelled}
      onPointerEnter={({ nativeEvent, timeStamp }) => {
        if (hovers(nativeEvent.pointerType)) onReach(timeStamp);
      }}
    >
      {compact ? null : (
        <Eyebrow>
          <Notation>{title}</Notation>
        </Eyebrow>
      )}
      {notes.length ? (
        <View>
          {notes.map((shown, index) => (
            <NoteView
              // A position's notes differ as a whole (merge.ts drops exact repeats), not always in text.
              key={JSON.stringify(shown.note) + (shown.before ?? '')}
              lesson={lesson}
              shown={shown}
              learner={learner}
              playback={playback}
              pointable={pointable.includes(shown.note)}
              pointed={shown.note === pointed}
              onPoint={onPoint}
              onLeave={onLeave}
              lead={index === 0 ? lead : undefined}
              density={density}
            />
          ))}
        </View>
      ) : (
        <Text role="bodySm" tone="secondary">
          {emptyLead}
          <Notation>{empty}</Notation>
        </Text>
      )}
    </Stack>
  );
}

/** A compact card's title, leading a note's words: the accent's italic, a little larger than them. */
function Lead({ children }: { readonly children: string }) {
  const { theme } = useTheme();
  return (
    <Text style={[styles.lead, { color: theme.semantic.color.tones.accent.text }]}>
      <Notation>{children}</Notation>
    </Text>
  );
}

/**
 * What the idea card says for a move pointed at that has no notes: that it
 * has none, and Stockfish's verdict on it when there is one.
 * Example: "No notes on g6. Stockfish: Inaccuracy, 0.6 pawns worse for you."
 */
export const noNotesText = (san: string, verdict?: EngineVerdict) =>
  `No notes on ${san}.${verdict ? ` ${verdictText(verdict)}.` : ''}`;

/** What stands in the idea card's place where it has nothing to show: a heading, as the card's, over `detail`. */
export function IdeaAside({ title, detail }: { readonly title: string; readonly detail: string }) {
  const labelled = useLabelled();
  return (
    <Stack style={labelled}>
      <Eyebrow>{title}</Eyebrow>
      <Text role="body" tone="secondary">
        {detail}
      </Text>
    </Stack>
  );
}

export function NoteView({
  lesson,
  shown,
  learner,
  playback,
  pointable,
  pointed,
  onPoint,
  onLeave,
  lead,
  density,
}: {
  readonly lesson: Lesson;
  readonly shown: ShownNote;
  readonly learner: Color;
  readonly playback: Playback;
  readonly pointable: boolean;
  readonly pointed: boolean;
  readonly onPoint: (note: BoardNote) => void;
  readonly onLeave: (note: BoardNote) => void;
  /** What leads the note's words: a compact card's title. */
  readonly lead?: ReactNode;
  readonly density: Density;
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
  // Only a note the AI wrote from nothing is credited: a rewritten study
  // comment is the study's analysis, so its model stays in the data only.
  const creditedModel = note.generated ? note.model : undefined;
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
  const compact = density === 'compact';
  const heading =
    drawn || verdict ? (
      <View style={styles.heading}>
        {drawn ? <KindTag label={KINDS[drawn.type]} tone={ideaTone(drawn, learner)} /> : <View />}
        {verdict ? <Verdict value={verdict} /> : null}
      </View>
    ) : null;
  // In a compact card a verdict with no kind beside it goes below the words, which come first.
  const verdictBelow = compact && !drawn && Boolean(verdict);

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
        compact && styles.compactNote,
        {
          borderTopRightRadius: theme.semantic.radius.sm,
          borderBottomRightRadius: theme.semantic.radius.sm,
        },
        litIdea
          ? {
              borderColor: toneColors[ideaTone(litIdea, learner)],
              backgroundColor: color.tones.neutral.subtle,
            }
          : // A compact note's rule shows only while its idea is on the board.
            { borderColor: compact ? 'transparent' : color.tones.accent.solid },
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
        {verdictBelow ? null : heading}
        <NoteText lesson={lesson} shown={shown} learner={learner} lead={lead} density={density} />
        {verdictBelow ? heading : null}
        {more && original ? (
          <Text role="bodySm" tone="secondary" style={compact && styles.original}>
            {original}
          </Text>
        ) : null}
      </Stack>
      {original || playable || creditedModel ? (
        <View style={styles.actions}>
          {playing ? (
            <PlayingControls playing={playing} goto={playback.goto} stop={playback.stop} />
          ) : playable ? (
            <Button
              size="sm"
              variant="soft"
              tone="accent"
              accessibilityLabel={PLAY[playable]}
              onPress={() => playback.play(shown)}
            >
              <Ionicons name="play" size={13} />
              {` ${compact ? PLAY_SHORT[playable] : PLAY[playable]}`}
            </Button>
          ) : null}
          {original ? (
            // A compact card's is a small mark; its label says what it opens.
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={compact ? 'The study’s words' : undefined}
              {...a11yState({ expanded: more })}
              onPress={() => setMore(!more)}
              style={compact ? styles.wordsButton : styles.more}
            >
              {compact ? (
                <Ionicons
                  name="reader-outline"
                  size={18}
                  color={more ? color.tones.accent.text : color.textSecondary}
                />
              ) : (
                <Text role="caption" tone="secondary" style={styles.moreText}>
                  {more ? 'Less' : 'The study’s words'}
                </Text>
              )}
            </Pressable>
          ) : null}
          {creditedModel ? <ModelMark model={creditedModel} /> : null}
        </View>
      ) : null}
    </Stack>
  );
}

/** The AI model that wrote a generated note, as a small mark whose tooltip names it. */
function ModelMark({ model }: { readonly model: AiModel }) {
  const { theme } = useTheme();
  const tip = `Generated by ${AI_MODELS[model]}. No guide explains this move.`;
  return (
    <Tip tip={tip} style={styles.model}>
      <Ionicons name="sparkles" size={14} color={theme.semantic.color.textSecondary} />
    </Tip>
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

/** The same, on a compact card's small control beside its play mark. */
const PLAY_SHORT: Readonly<Record<PlayedBack['type'], string>> = {
  plan: 'Plan',
  line: 'Line',
  trap: 'Trap',
};

/** Each kind's name. */
const KINDS: Readonly<Record<Exclude<BoardIdea['type'], 'evaluation'>, string>> = {
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
  // Its rule's room stays, so a lit note doesn't shift its words.
  compactNote: { paddingLeft: 8, paddingRight: 4, paddingVertical: 4 },
  lead: { fontFamily: fonts.displayItalic, fontSize: 16 },
  // The study's own words, in the serif, as the lead.
  original: { fontFamily: fonts.display, fontSize: 16, lineHeight: 23 },
  wordsButton: { padding: 6 },
  // A pane too narrow for the kind and the verdict side by side puts the verdict under the kind.
  heading: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    rowGap: 4,
  },
  kind: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  actions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
  more: { paddingVertical: 4 },
  moreText: { textDecorationLine: 'underline' },
  // The model's mark keeps to the row's far end, after any buttons.
  model: { marginLeft: 'auto', padding: 4 },
  // Out of sight and out of layout, but read.
  playing: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  count: { minWidth: 48 },
});
