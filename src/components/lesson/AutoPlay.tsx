import { Field, Switch, useTheme } from '@reactive/silk-native';
import { StyleSheet } from 'react-native';

import { useSettings, useSettingsDispatch } from '@/settings/SettingsProvider';

/**
 * Whether the opponent replies by itself, as a small switch at the end of its
 * name bar; off, the learner picks its move. A setting, so it's remembered.
 */
export function AutoPlay() {
  const { auto } = useSettings();
  const dispatch = useSettingsDispatch();
  const { theme } = useTheme();
  return (
    <Field.Root orientation="horizontal" style={styles.field}>
      <Switch
        size="sm"
        tone="accent"
        checked={auto}
        onCheckedChange={(on) => dispatch({ type: 'chosen', choice: { auto: on } })}
      />
      {/* Quieter than the name beside it, as the bar's detail is. */}
      <Field.Label
        numberOfLines={1}
        style={[styles.label, { color: theme.semantic.color.textSecondary }]}
      >
        Auto play
      </Field.Label>
    </Field.Root>
  );
}

const styles = StyleSheet.create({
  // The label before the switch, at the bar's end. It keeps its size while
  // the names before it give way.
  field: { flexDirection: 'row-reverse', flexShrink: 0, gap: 6 },
  label: { userSelect: 'none' },
});
