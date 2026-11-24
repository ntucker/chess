import { StyleSheet, Text } from 'react-native';

import { splitPieceLetters } from '@/game/notation';
import { useSettings } from '@/settings/SettingsProvider';
import { fonts } from '@/theme/theme';

/**
 * `children` inside a Text, with the piece letter of each move it names
 * drawn as the piece when the learner chose icons (the `notation` setting):
 * "23…Qb6" shows the queen. The letter is still the text, so screen readers,
 * copying and searching read the move as before.
 *
 * ```tsx
 * <Text role="bodySm">
 *   <Notation>{`Found with ${tried}.`}</Notation>
 * </Text>
 * ```
 */
export function Notation({ children }: { readonly children: string }) {
  const { notation } = useSettings();
  if (notation === 'letters') return children;
  return splitPieceLetters(children).map((part, n) =>
    n % 2 ? (
      <Text key={n} style={styles.piece}>
        {part}
      </Text>
    ) : (
      part
    ),
  );
}

const styles = StyleSheet.create({
  piece: { fontFamily: fonts.figurines },
});
