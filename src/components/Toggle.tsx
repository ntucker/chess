import { Field, Switch, Tooltip, useTheme } from '@reactive/silk-native';
import { type StyleProp, StyleSheet, type ViewStyle } from 'react-native';

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
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * A switch with its label beside it; the label names it and toggles it too.
 * On a touch screen the label makes the row a finger tall (`touchLine`), so
 * the small switch is easy to hit. A disabled one says why in a tooltip (a
 * resting mouse, or a tap), and to screen readers as its description, since
 * the tooltip isn't read from it.
 */
export function Toggle({ label, checked, onChange, quiet, disabled, style }: Props) {
  const { theme } = useTheme();
  const field = (
    <Field.Root orientation="horizontal" disabled={Boolean(disabled)} style={[styles.field, style]}>
      <Switch size="sm" tone="accent" checked={checked} onCheckedChange={onChange} />
      <Field.Label
        numberOfLines={quiet ? 1 : undefined}
        style={[styles.label, quiet && { color: theme.semantic.color.textSecondary }]}
      >
        {label}
      </Field.Label>
      {disabled ? <Field.Description style={styles.spoken}>{disabled}</Field.Description> : null}
    </Field.Root>
  );
  if (!disabled) return field;
  return (
    <Tooltip.Root>
      <Tooltip.Trigger>{field}</Tooltip.Trigger>
      <Tooltip.Content>{disabled}</Tooltip.Content>
    </Tooltip.Root>
  );
}

const styles = StyleSheet.create({
  // Natively a shorter parent (a phone's 32 dp name bar) would fit the row
  // inside it; the least height lets the row stand out past it instead.
  field: { minHeight: touchTarget },
  label: { userSelect: 'none', ...touchLine(lineHeightOf('label')) },
  spoken: spokenOnly,
});
