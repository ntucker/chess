import { Text } from '@reactive/silk-native';
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';

import { narrowLength } from '@/theme/narrow';

/** Space between an eyebrow and what it labels: less on a narrow web page. */
const LABEL_GAP = narrowLength('label-gap', 12);

/** The small spaced capitals that label a section of the panel. */
export function Eyebrow({ children }: { readonly children: ReactNode }) {
  return (
    <Text role="caption" tone="secondary" style={styles.eyebrow}>
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
