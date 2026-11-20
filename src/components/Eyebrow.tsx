import { Text } from '@reactive/silk-native';
import type { ReactNode } from 'react';
import { type StyleProp, StyleSheet, type TextStyle } from 'react-native';

import { narrowLength } from '@/theme/narrow';
import { themes } from '@/theme/theme';

/** Space between an eyebrow and what it labels: Silk's step 3, less on a narrow web page. */
const LABEL_GAP = narrowLength('label-gap', themes.dark.semantic.space[3]);

interface Props {
  readonly children: ReactNode;
  readonly numberOfLines?: number;
  /** Changes to its size or spacing, as in the narrow header. */
  readonly style?: StyleProp<TextStyle>;
}

/** The small spaced capitals that label a section of the panel. */
export function Eyebrow({ children, numberOfLines, style }: Props) {
  return (
    <Text
      role="caption"
      tone="secondary"
      numberOfLines={numberOfLines}
      style={[styles.eyebrow, style]}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  labelled: { gap: LABEL_GAP.value },
  eyebrow: { textTransform: 'uppercase', letterSpacing: 1.6 },
});

/** A Stack's style that spaces an eyebrow from what it labels. */
export const labelled = styles.labelled;
