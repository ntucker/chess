import { Field, Switch, useTheme } from '@reactive/silk-native';
import { type StyleProp, StyleSheet, type ViewStyle } from 'react-native';

import { lineHeightOf } from '@/theme/theme';
import { touchPadding, touchTarget } from '@/theme/touch';

interface Props {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  /** A quieter, one-line label, for a switch beside more important text. */
  readonly quiet?: boolean;
  /** Shown but not changeable, keeping its value: it does nothing where it is now. */
  readonly disabled?: boolean;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * A switch with its label beside it; the label names it and toggles it too.
 * On a touch screen the label's padding makes the row a finger tall
 * (`touchPadding`), so the small switch is easy to hit.
 */
export function Toggle({ label, checked, onChange, quiet, disabled, style }: Props) {
  const { theme } = useTheme();
  return (
    <Field.Root orientation="horizontal" disabled={disabled} style={[styles.field, style]}>
      <Switch size="sm" tone="accent" checked={checked} onCheckedChange={onChange} />
      <Field.Label
        numberOfLines={quiet ? 1 : undefined}
        style={[styles.label, quiet && { color: theme.semantic.color.textSecondary }]}
      >
        {label}
      </Field.Label>
    </Field.Root>
  );
}

const styles = StyleSheet.create({
  // The label's padding alone would do in a browser, but natively a shorter
  // parent (a phone's 32 dp name bar) fits the row inside it and squeezes the
  // label's text out; the least height lets the row stand out past it instead.
  field: { minHeight: touchTarget },
  label: { userSelect: 'none', paddingVertical: touchPadding(lineHeightOf('label')) },
});
