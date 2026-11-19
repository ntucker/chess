import { StyleSheet } from 'react-native';

import { Toggle } from '@/components/Toggle';
import { useSettings, useSettingsDispatch } from '@/settings/SettingsProvider';

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
  // On screen the label comes before the switch, the reverse of Toggle's
  // order, so the switch ends the bar. It keeps its size while the names
  // before it give way.
  field: { flexDirection: 'row-reverse', flexShrink: 0, gap: 6 },
});
