import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, Surface, Text, useTheme } from '@reactive/silk-native';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import { type IconAction, IconActions } from '@/components/IconActions';
import { Notation } from '@/components/Notation';
import type { Acts, Found, Payoff } from '@/opportunity/cue';
import { fonts } from '@/theme/theme';

import { PastNote } from './IdeaCard';

/** What the lesson screen shows of a cue's acts (`LessonScreenModel.acts`). */
export interface ActsModel extends Pick<Acts, 'found' | 'payoff'> {
  /** The headline's detail, for a phone's pane, where the headline leaves it out. */
  readonly line: string;
  /** The cue's question still stands (no try has passed): its controls show. */
  readonly asking: boolean;
  /** Back to the cue, after a try that didn't pass; undefined when it does nothing. */
  readonly onRetry?: () => void;
  /** The reply, drawn on the board; undefined once shown or passed. */
  readonly onShow?: () => void;
  /** Leaves the question for ordinary Explore; undefined once passed. */
  readonly onSkip?: () => void;
  /** The guide's note on the mistake, once its punishment lands, with its play-through. */
  readonly note?: ComponentProps<typeof PastNote>;
}

/** How an act stands: done, the one being played, still to come, or left out. */
type Stage = 'done' | 'now' | 'shown' | 'missed' | 'ahead' | 'none';

/** Act II's stage, by how the learner's try stands. */
const CUE_STAGES: Record<Found, Stage> = {
  open: 'now',
  shown: 'shown',
  pending: 'now',
  passed: 'done',
  failed: 'missed',
  unchecked: 'missed',
};

/** Act III's stage, by how the payoff stands. */
const PAYOFF_STAGES: Record<Payoff, Stage> = {
  ahead: 'ahead',
  playing: 'now',
  done: 'done',
  none: 'none',
};

/** The three acts, each with its numeral, name and how it stands. */
const actStages = ({ found, payoff }: Pick<ActsModel, 'found' | 'payoff'>) => [
  { numeral: 'I', name: 'Setup', stage: 'done' as Stage },
  { numeral: 'II', name: 'Your cue', stage: CUE_STAGES[found] },
  { numeral: 'III', name: 'Payoff', stage: PAYOFF_STAGES[payoff] },
];

type Tone = 'success' | 'danger' | 'accent';

/**
 * What each stage says to a screen reader, draws beside the act's name, and
 * the tone it is inked in (none: secondary text).
 */
const STAGES: Record<
  Stage,
  { readonly spoken: string; readonly icon?: IconAction['icon']; readonly tone?: Tone }
> = {
  done: { spoken: 'done', icon: 'checkmark', tone: 'success' },
  now: { spoken: 'now', tone: 'accent' },
  shown: { spoken: 'shown', icon: 'eye-outline' },
  missed: { spoken: 'not yet', icon: 'close', tone: 'danger' },
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
        const { icon, spoken, tone } = STAGES[stage];
        const ink = tone ? color.tones[tone].text : color.textSecondary;
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
}: Pick<ActsModel, 'onRetry' | 'onShow' | 'onSkip'>) {
  const actions: readonly IconAction[] = [
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
      <IconActions actions={actions} />
    </View>
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
        {acts.asking ? <CueControls {...acts} /> : null}
        {acts.note ? <PastNote {...acts.note} /> : null}
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
