import { StyleSheet, View } from 'react-native';

import { PillChoice } from '@/components/PillChoice';
import { Toggle } from '@/components/Toggle';
import { type LessonMode, movesSwitchApplies } from '@/lesson/guidance';
import { useSettings, useSettingsDispatch } from '@/settings/SettingsProvider';

const MODES = [
  { value: 'explore', label: 'Explore' },
  { value: 'practice', label: 'Practice' },
] as const;

interface Props {
  readonly mode: LessonMode;
  readonly onMode: (mode: LessonMode) => void;
}

/**
 * The lesson's switches: Explore or Practice, and what the board draws. The
 * mode belongs to the screen; the rest are settings, so they are remembered.
 * Who moves the opponent is the opponent's bar's (`AutoPlay`).
 */
export function LessonControls({ mode, onMode }: Props) {
  const { showMoves, showTraps } = useSettings();
  const dispatch = useSettingsDispatch();
  return (
    <View style={styles.controls}>
      <PillChoice label="Mode" options={MODES} value={mode} onChange={onMode} />
      <View style={styles.toggles}>
        <Toggle
          label="Arrows"
          hint="Draws the next moves on the board as arrows, before you point at one."
          checked={showMoves}
          disabled={movesSwitchApplies(mode) ? undefined : 'Only in Explore'}
          onChange={(on) => dispatch({ type: 'chosen', choice: { showMoves: on } })}
        />
        <Toggle
          label="Warn of traps"
          hint="Draws a trap's moves on the board before you can fall into it."
          checked={showTraps}
          onChange={(on) => dispatch({ type: 'chosen', choice: { showTraps: on } })}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  controls: { gap: 14 },
  toggles: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 24, rowGap: 10 },
});
