import { Field, Switch, Tooltip, useTheme } from '@reactive/silk-native';
import { type StyleProp, StyleSheet, type ViewStyle } from 'react-native';

import { spokenOnly } from '@/theme/narrow';
import { lineHeightOf } from '@/theme/theme';
import { touchPadding, touchTarget } from '@/theme/touch';

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
 * On a touch screen the label's padding makes the row a finger tall
 * (`touchPadding`), so the small switch is easy to hit. A disabled one says
 * why in a tooltip (a resting mouse, or a tap), and to screen readers as its
 * description, since the tooltip isn't read from it.
 */
export function Toggle({ label, checked, onChange, quiet, disabled, style }: Props) {
  const { theme } = useTheme();
  const field = (
    <Field.Root orientation="horizontal" disabled={Boolean(disabled)} style={[styles.field, style]}>
      <Switch size="sm" tone="accent" checked={checked} onCheckedChange={onChange} />
      {/* Disabled, the label takes no press natively, so a tap on it reaches the tooltip. */}
      <Field.Label
        disabled={Boolean(disabled)}
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
  // The label's padding alone would do in a browser, but natively a shorter
  // parent (a phone's 32 dp name bar) fits the row inside it and squeezes the
  // label's text out; the least height lets the row stand out past it instead.
  field: { minHeight: touchTarget },
  label: { userSelect: 'none', paddingVertical: touchPadding(lineHeightOf('label')) },
  spoken: spokenOnly,
});
