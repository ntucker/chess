import { StyleSheet } from 'react-native';

import { useSettings, useSettingsDispatch } from '@/settings/SettingsProvider';

import { Toggle } from './Toggle';

/**
 * Whether the opponent replies by itself, as a small switch at the end of its
 * name bar; off, the learner picks its move. A setting, so it's remembered.
 */
export function AutoPlay() {
  const { auto } = useSettings();
  const dispatch = useSettingsDispatch();
  return (
    <Toggle
      label="Auto play"
      checked={auto}
      onChange={(on) => dispatch({ type: 'chosen', choice: { auto: on } })}
      // Quieter than the name beside it, as the bar's detail is.
      quiet
      style={styles.field}
    />
  );
}

const styles = StyleSheet.create({
  // The label before the switch, at the bar's end. It keeps its size while
  // the names before it give way.
  field: { flexDirection: 'row-reverse', flexShrink: 0, gap: 6 },
});
