import { Field, Switch, useTheme } from '@reactive/silk-native';
import { type StyleProp, StyleSheet, type ViewStyle } from 'react-native';

import { typography } from '@/theme/theme';
import { touchPadding, touchTarget } from '@/theme/touch';

interface Props {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  /** A quieter, one-line label, for a switch beside more important text. */
  readonly quiet?: boolean;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * A switch with its label beside it; the label names it and toggles it too.
 * On a touch screen the row is a finger tall (`touchTarget`), the label's
 * press filling it, so the small switch is easy to hit.
 */
export function Toggle({ label, checked, onChange, quiet, style }: Props) {
  const { theme } = useTheme();
  return (
    <Field.Root orientation="horizontal" style={[styles.field, style]}>
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

/** A label line's height, as Silk sets it. */
const LABEL_LINE = typography.label.size * typography.label.lineHeight;

const styles = StyleSheet.create({
  field: { minHeight: touchTarget },
  label: { userSelect: 'none', paddingVertical: touchPadding(LABEL_LINE) },
});
