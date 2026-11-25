import Ionicons from '@expo/vector-icons/Ionicons';
import { Button, Stack, Surface, Text, useTheme } from '@reactive/silk-native';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import { Notation } from '@/components/Notation';
import { Tip } from '@/components/Tip';
import type { Lesson } from '@/lesson/lesson';
import type { Playback } from '@/lesson/useLesson';
import type { ShownNote } from '@/lesson/view';
import type { Acts } from '@/opportunity/cue';
import { fonts } from '@/theme/theme';

import { NoteView } from './IdeaCard';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** What the lesson screen shows of a cue's acts (`LessonScreenModel.acts`). */
export interface ActsModel extends Pick<Acts, 'found' | 'payoff'> {
  /** The headline's detail, for a phone's pane, where the headline leaves it out. */
  readonly line: string;
  /** Back to the cue, after a try that didn't pass; undefined when it does nothing. */
  readonly onRetry?: () => void;
  /** The reply, drawn on the board; undefined once shown or passed. */
  readonly onShow?: () => void;
  /** Leaves the question for ordinary Explore; undefined once passed. */
  readonly onSkip?: () => void;
  /** The guide's note on the mistake, once its punishment lands, with its play-through. */
  readonly note?: {
    readonly lesson: Lesson;
    readonly shown: ShownNote;
    readonly learner: ComponentProps<typeof NoteView>['learner'];
    readonly playback: Playback;
  };
}

/** How an act stands: done, the one being played, still to come, or left out. */
type Stage = 'done' | 'now' | 'shown' | 'missed' | 'ahead' | 'none';

/** The three acts, each with its numeral, name and how it stands. */
function actStages({ found, payoff }: Pick<ActsModel, 'found' | 'payoff'>) {
  const cue: Stage =
    found === 'passed'
      ? 'done'
      : found === 'shown'
        ? 'shown'
        : found === 'failed' || found === 'unchecked'
          ? 'missed'
          : 'now';
  const third: Stage =
    payoff === 'done'
      ? 'done'
      : payoff === 'playing'
        ? 'now'
        : payoff === 'none'
          ? 'none'
          : 'ahead';
  return [
    { numeral: 'I', name: 'Setup', stage: 'done' as Stage },
    { numeral: 'II', name: 'Your cue', stage: cue },
    { numeral: 'III', name: 'Payoff', stage: third },
  ];
}

/** What each stage says to a screen reader, and draws beside the act's name. */
const STAGES: Record<Stage, { readonly spoken: string; readonly icon?: IconName }> = {
  done: { spoken: 'done', icon: 'checkmark' },
  now: { spoken: 'now' },
  shown: { spoken: 'shown', icon: 'eye-outline' },
  missed: { spoken: 'not yet', icon: 'close' },
  ahead: { spoken: 'to come' },
  none: { spoken: 'none in this line', icon: 'remove' },
};

/**
 * The opportunity's three acts, as rows a phone's moves pane holds in the
 * candidates' place (`column`), or as a row of chips (`row`): the setup,
 * reached; the cue, as the learner's try stands; and the payoff.
 */
export function ActRows({
  acts,
  direction,
}: {
  readonly acts: Pick<ActsModel, 'found' | 'payoff'>;
  readonly direction: 'row' | 'column';
}) {
  const { color } = useTheme().theme.semantic;
  return (
    <View
      role="list"
      aria-label="The opportunity's three acts"
      style={direction === 'row' ? styles.chips : styles.rows}
    >
      {actStages(acts).map(({ numeral, name, stage }) => {
        const now = stage === 'now';
        const ink =
          stage === 'done'
            ? color.tones.success.text
            : stage === 'missed'
              ? color.tones.danger.text
              : now
                ? color.tones.accent.text
                : color.textSecondary;
        const { icon, spoken } = STAGES[stage];
        return (
          <View
            key={numeral}
            role="listitem"
            aria-label={`Act ${numeral}, ${name}: ${spoken}`}
            style={[
              styles.act,
              direction === 'row' && [styles.chip, { borderColor: color.borderSubtle }],
              now && {
                backgroundColor: color.tones.accent.subtle,
                borderColor: color.tones.accent.border,
              },
            ]}
          >
            <Text style={[styles.numeral, { color: ink }]} aria-hidden>
              {numeral}
            </Text>
            <Text role="label" numberOfLines={1} style={[styles.name, { color: ink }]} aria-hidden>
              {name}
            </Text>
            {icon ? <Ionicons name={icon} size={14} color={ink} aria-hidden /> : null}
          </View>
        );
      })}
    </View>
  );
}

/** Retry, Show the move and Skip, as icons named by their tooltips; disabled where they do nothing. */
export function CueControls({
  onRetry,
  onShow,
  onSkip,
}: Omit<ActsModel, 'line' | 'found' | 'payoff'>) {
  const actions: readonly { icon: IconName; tip: string; onPress?: () => void }[] = [
    { icon: 'refresh', tip: 'Retry: back to the cue to try another move', onPress: onRetry },
    {
      icon: 'eye-outline',
      tip: 'Show the move: draw the punishment on the board',
      onPress: onShow,
    },
    {
      icon: 'play-skip-forward-outline',
      tip: 'Skip: play on with every hint shown',
      onPress: onSkip,
    },
  ];
  return (
    <View role="toolbar" aria-label="Your cue" style={styles.controls}>
      {actions.map(({ icon, tip, onPress }) => (
        // Disabled, the button takes no focus, so the tip takes it to open from the keyboard.
        <Tip key={icon} tip={tip} focusable={!onPress}>
          <Button variant="outline" disabled={!onPress} onPress={onPress} accessibilityLabel={tip}>
            <Ionicons name={icon} size={17} />
          </Button>
        </Tip>
      ))}
    </View>
  );
}

/** Whether the cue's question still waits on the learner: its controls show. */
export const asking = ({ found }: Pick<ActsModel, 'found'>) => found !== 'passed';

/**
 * The guide's note on the mistake, once the punishment lands, with its
 * play-through: a card of its own, so its note keeps its rule on a phone too.
 */
export function ActsNote({ note }: { readonly note: NonNullable<ActsModel['note']> }) {
  return (
    <NoteView
      lesson={note.lesson}
      shown={note.shown}
      learner={note.learner}
      playback={note.playback}
      // Its ideas are about the position before the mistake, so pointing draws nothing.
      pointable={false}
      pointed={false}
      density="comfortable"
      onPoint={() => undefined}
      onLeave={() => undefined}
    />
  );
}

/**
 * A cue's acts in the wide panel, where the trap card would be: the acts as
 * chips, then the cue's controls while it asks, or the guide's note once the
 * punishment lands. The headline above says what to do.
 */
export function ActsCard({ acts }: { readonly acts: ActsModel }) {
  const { color } = useTheme().theme.semantic;
  return (
    <Surface
      radius="md"
      border="subtle"
      style={[
        styles.card,
        { borderColor: color.tones.accent.border, backgroundColor: color.tones.accent.subtle },
      ]}
    >
      <Stack gap="3">
        <ActRows acts={acts} direction="row" />
        {asking(acts) ? <CueControls {...acts} /> : null}
        {acts.note ? <ActsNote note={acts.note} /> : null}
      </Stack>
    </Surface>
  );
}

/** The phone's pane beside the acts while the cue asks: the headline's line, then the controls. */
export function CuePane({ acts }: { readonly acts: ActsModel }) {
  return (
    <Stack gap="3">
      <Text role="bodySm">
        <Notation>{acts.line}</Notation>
      </Text>
      <CueControls {...acts} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16 },
  rows: { gap: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  // A phone's moves pane keeps its 32-high rows.
  act: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 32,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  chip: { borderWidth: 1, borderRadius: 999, minHeight: 28, paddingHorizontal: 10 },
  numeral: { fontFamily: fonts.displayItalic, minWidth: 16 },
  name: { flexShrink: 1 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
