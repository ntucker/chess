import Ionicons from '@expo/vector-icons/Ionicons';
import { Text, useTheme } from '@reactive/silk-native';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import type { Acts, PayoffStage } from '@/opportunity/cue';
import { fonts } from '@/theme/theme';

import { PastNote } from './IdeaCard';
import { ToneCard } from './ToneCard';

/** The guide's note on a cue's mistake, once its punishment lands, with its play-through. */
type MistakeNote = ComponentProps<typeof PastNote>;

/** How a cue's acts stand: whether the cue is answered, and how the payoff stands. */
type ActsStanding = Pick<Acts, 'replied' | 'payoff'>;

/** What the lesson screen shows of a cue's acts in Explore (`LessonScreenModel.acts`). */
export interface ActsModel extends ActsStanding {
  readonly note?: MistakeNote;
}

/** How an act stands: done, the one being played, still to come, or left out. */
type Stage = 'done' | 'now' | 'ahead' | 'none';

/** Act III's stage, by how the payoff stands. */
const PAYOFF_STAGES: Record<PayoffStage, Stage> = {
  ahead: 'ahead',
  playing: 'now',
  done: 'done',
  none: 'none',
};

/** The three acts, each with its numeral, name and how it stands. */
const actStages = ({ replied, payoff }: ActsStanding) => [
  { numeral: 'I', name: 'Setup', stage: 'done' as Stage },
  { numeral: 'II', name: 'Your cue', stage: (replied ? 'done' : 'now') as Stage },
  { numeral: 'III', name: 'Payoff', stage: PAYOFF_STAGES[payoff] },
];

type Tone = 'success' | 'danger' | 'accent';

/**
 * What each stage says to a screen reader, draws beside the act's name, and
 * the tone it is inked in (none: secondary text).
 */
const STAGES: Record<
  Stage,
  {
    readonly spoken: string;
    readonly icon?: ComponentProps<typeof Ionicons>['name'];
    readonly tone?: Tone;
  }
> = {
  done: { spoken: 'done', icon: 'checkmark', tone: 'success' },
  now: { spoken: 'now', tone: 'accent' },
  ahead: { spoken: 'to come' },
  none: { spoken: 'none in this line', icon: 'remove' },
};

/** The opportunity's three acts as a row of chips: the setup, reached; the cue; the payoff. */
function ActChips({ acts }: { readonly acts: ActsStanding }) {
  const { color } = useTheme().theme.semantic;
  return (
    <View role="list" aria-label="The opportunity's three acts" style={styles.chips}>
      {actStages(acts).map(({ numeral, name, stage }) => {
        const { icon, spoken, tone } = STAGES[stage];
        const ink = tone ? color.tones[tone].text : color.textSecondary;
        return (
          <View
            key={numeral}
            role="listitem"
            aria-label={`Act ${numeral}, ${name}: ${spoken}`}
            style={[
              styles.chip,
              { borderColor: color.borderSubtle },
              stage === 'now' && {
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

/**
 * A cue's acts in Explore, where the trap card would be: the acts as chips,
 * then the guide's note on the mistake once the punishment lands. The
 * headline above names the mistake; every hint shows as usual.
 */
export function ActsCard({ acts }: { readonly acts: ActsModel }) {
  return (
    <ToneCard tone="accent">
      <ActChips acts={acts} />
      {acts.note ? <PastNote {...acts.note} /> : null}
    </ToneCard>
  );
}

interface OpportunityProps {
  /** The learner's move punished the mistake (`Cue.found`). */
  readonly found: boolean;
  /** The other side's mistake, as the scoresheet writes it: "Nxe5". */
  readonly mistake: string;
  /** The line's reply, which punishes it: "c6". */
  readonly reply: string;
  /** The learner's move at the cue: "c6", or a miss such as "a6". */
  readonly tried: string;
  readonly note?: MistakeNote;
}

/**
 * In Practice, after the learner's move at a cue: whether it punished the
 * other side's mistake, and if not, the move that does, with the guide's
 * note on the mistake once its punishment lands. Practice's take-back
 * gives the cue another try.
 */
export function OpportunityCard({ found, mistake, reply, tried, note }: OpportunityProps) {
  return (
    <ToneCard
      tone={found ? 'success' : 'danger'}
      heading={{
        icon: found ? 'checkmark-circle' : 'close-circle',
        title: found
          ? `You punished ${mistake} with ${tried}.`
          : `${mistake} was a mistake: ${reply} punishes it.`,
      }}
    >
      {note ? <PastNote {...note} /> : null}
    </ToneCard>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 28,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: 999,
  },
  numeral: { fontFamily: fonts.displayItalic, minWidth: 16 },
  name: { flexShrink: 1 },
});
