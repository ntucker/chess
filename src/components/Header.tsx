import { Inline, Separator, Text } from '@reactive/silk-native';
import { Image, StyleSheet } from 'react-native';

import { SourceLink } from '@/components/SourceLink';
import { fonts } from '@/theme/theme';

/** The header's height on one line: its logo, the tallest thing in it. */
export const HEADER_HEIGHT = 40;

/**
 * The wordmark (the logo, the name in the display serif, and the tagline),
 * with a link to the source at the far end.
 */
export function Header() {
  return (
    <Inline gap="2" align="center" justify="between">
      <Inline gap="3" align="center" wrap="nowrap">
        <Image
          source={require('@/assets/images/logo-mark.png')}
          style={styles.logo}
          accessibilityIgnoresInvertColors
        />
        <Text role="heading" accessibilityRole="header" style={styles.wordmark}>
          Opening Night
        </Text>
      </Inline>
      <Inline gap="3" align="center" wrap="nowrap">
        <Text role="caption" tone="secondary" style={styles.tagline}>
          Learn your lines
        </Text>
        <Separator orientation="vertical" style={styles.rule} />
        <SourceLink />
      </Inline>
    </Inline>
  );
}

const styles = StyleSheet.create({
  logo: { width: HEADER_HEIGHT, height: HEADER_HEIGHT, borderRadius: 10 },
  wordmark: { fontFamily: fonts.display, fontSize: 26, letterSpacing: 0.2 },
  tagline: { fontFamily: fonts.displayItalic, fontSize: 17 },
  rule: { height: 18, alignSelf: 'center' },
});
