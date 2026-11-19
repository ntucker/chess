import { Field, Switch } from '@reactive/silk-native';
import { StyleSheet, View } from 'react-native';

import { PillChoice } from '@/components/PillChoice';
import type { LessonMode } from '@/lesson/guidance';
import { useSettings, useSettingsDispatch } from '@/settings/SettingsProvider';

const MODES = [
  { value: 'explore', label: 'Explore' },
  { value: 'practice', label: 'Practice' },
] as const;

const REPLIES = [
  { value: 'auto', label: 'Auto' },
  { value: 'choose', label: 'I choose' },
] as const;

interface Props {
  readonly mode: LessonMode;
  readonly onMode: (mode: LessonMode) => void;
}

/**
 * The lesson's switches: Explore or Practice, who moves the opponent, and
 * what the board draws. The mode belongs to the screen; the rest are
 * settings, so they are remembered.
 */
export function LessonControls({ mode, onMode }: Props) {
  const { auto, showIdeas, showTraps } = useSettings();
  const dispatch = useSettingsDispatch();
  return (
    <View style={styles.controls}>
      <View style={styles.pills}>
        <View style={styles.pill}>
          <PillChoice label="Mode" options={MODES} value={mode} onChange={onMode} />
        </View>
        <View style={styles.pill}>
          <PillChoice
            label="The opponent's moves"
            options={REPLIES}
            value={auto ? 'auto' : 'choose'}
            onChange={(reply) => dispatch({ type: 'chosen', choice: { auto: reply === 'auto' } })}
          />
        </View>
      </View>
      <View style={styles.toggles}>
        {/* Guidance ignores this switch in Practice, so it's Explore's. */}
        {mode === 'explore' ? (
          <Toggle
            label="Ideas on the board"
            checked={showIdeas}
            onChange={(on) => dispatch({ type: 'chosen', choice: { showIdeas: on } })}
          />
        ) : null}
        <Toggle
          label="Warn me of traps"
          checked={showTraps}
          onChange={(on) => dispatch({ type: 'chosen', choice: { showTraps: on } })}
        />
      </View>
    </View>
  );
}

/** A switch with its label beside it; the label names it and toggles it too. */
function Toggle({
  label,
  checked,
  onChange,
}: {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}) {
  return (
    <Field.Root orientation="horizontal">
      <Switch size="sm" tone="accent" checked={checked} onCheckedChange={onChange} />
      <Field.Label style={styles.label}>{label}</Field.Label>
    </Field.Root>
  );
}

const styles = StyleSheet.create({
  controls: { gap: 14 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  // Side by side while both fit, stacked on a narrow phone.
  pill: { flexGrow: 1, flexBasis: 200 },
  toggles: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 24, rowGap: 10 },
  label: { userSelect: 'none' },
});
