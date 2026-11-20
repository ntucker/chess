import { Field, Switch, useTheme } from '@reactive/silk-native';
import { type StyleProp, StyleSheet, type ViewStyle } from 'react-native';

import { lineHeightOf } from '@/theme/theme';
import { touchPadding } from '@/theme/touch';

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
 * On a touch screen the label's padding makes the row a finger tall
 * (`touchPadding`), so the small switch is easy to hit.
 */
export function Toggle({ label, checked, onChange, quiet, style }: Props) {
  const { theme } = useTheme();
  return (
    <Field.Root orientation="horizontal" style={style}>
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
  label: { userSelect: 'none', paddingVertical: touchPadding(lineHeightOf('label')) },
});
