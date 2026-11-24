import { Field, Switch, Tooltip, useTheme } from '@reactive/silk-native';
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';

import { InfoMark } from '@/components/Tip';
import { spokenOnly } from '@/theme/narrow';
import { lineHeightOf } from '@/theme/theme';
import { touchLine, touchTarget } from '@/theme/touch';

interface Props {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  /** A quieter, one-line label, for a switch beside more important text. */
  readonly quiet?: boolean;
  /** Why it can't be changed now: given (not empty), the switch shows disabled, with this as its tooltip. */
  readonly disabled?: string;
  /** What it does, for a short label: its tooltip while it can be changed. */
  readonly hint?: string;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * A switch with its label beside it; the label names it and toggles it too.
 * On a touch screen the label makes the row a finger tall (`touchLine`), so
 * the small switch is easy to hit. A disabled one says why in a tooltip (a
 * resting mouse, or a tap), and an enabled one its `hint`, marked by an
 * info icon, since a tap on the label toggles it: a mouse resting on the
 * icon, or a tap on it, shows it. Screen readers hear either as its
 * description, since the tooltip isn't read from it. Until silk#38 lets a
 * label keep its press on the web, the icon alone can open an enabled one's
 * tooltip, so keyboard focus on the switch doesn't.
 */
export function Toggle({ label, checked, onChange, quiet, disabled, hint, style }: Props) {
  const { theme } = useTheme();
  const tip = disabled || hint;
  const field = (
    <Field.Root orientation="horizontal" disabled={Boolean(disabled)} style={[styles.field, style]}>
      <Switch size="sm" tone="accent" checked={checked} onCheckedChange={onChange} />
      <Field.Label
        numberOfLines={quiet ? 1 : undefined}
        style={[styles.label, quiet && { color: theme.semantic.color.textSecondary }]}
      >
        {label}
      </Field.Label>
      {tip ? <Field.Description style={styles.spoken}>{tip}</Field.Description> : null}
    </Field.Root>
  );
  if (!tip) return field;
  return (
    <Tooltip.Root>
      {disabled ? (
        // A disabled field takes no press, so a tap anywhere on it says why.
        <Tooltip.Trigger>{field}</Tooltip.Trigger>
      ) : (
        // The mark alone is the trigger: on the web a press on the label is a
        // click for its switch, which a trigger around the field opens on too.
        <View style={styles.row}>
          {field}
          {/* Screen readers hear the hint as the switch's description. */}
          <Tooltip.Trigger aria-hidden testID="toggle-hint" style={styles.info}>
            <InfoMark size={INFO_SIZE} />
          </Tooltip.Trigger>
        </View>
      )}
      <Tooltip.Content>{tip}</Tooltip.Content>
    </Tooltip.Root>
  );
}

const INFO_SIZE = 15;

const styles = StyleSheet.create({
  // Natively a shorter parent (a phone's 32 dp name bar) would fit the row
  // inside it; the least height lets the row stand out past it instead.
  field: { minHeight: touchTarget },
  label: { userSelect: 'none', ...touchLine(lineHeightOf('label')) },
  spoken: spokenOnly,
  row: { flexDirection: 'row', alignItems: 'stretch' },
  // The row's height, so a finger finds it beside the label.
  info: { alignSelf: 'stretch', justifyContent: 'center', paddingHorizontal: 4 },
});
