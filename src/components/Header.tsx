import { Inline, Separator, Text } from '@reactive/silk-native';
import { Image, StyleSheet } from 'react-native';

import { SourceLink } from '@/components/SourceLink';
import { phoneLength, wideOnly } from '@/theme/phone';
import { fonts } from '@/theme/theme';

/** The header's height: its logo, the tallest thing in it. Shorter on a phone. */
export const HEADER_HEIGHT = phoneLength('header-height', 40);

/**
 * The wordmark (the logo, the name in the display serif, and the tagline),
 * with a link to the source at the far end. On a phone it's one short row:
 * a smaller logo and name, and no tagline.
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
        <Inline gap="3" align="center" wrap="nowrap" style={wideOnly}>
          <Text role="caption" tone="secondary" style={styles.tagline}>
            Learn your lines
          </Text>
          <Separator orientation="vertical" style={styles.rule} />
        </Inline>
        <SourceLink />
      </Inline>
    </Inline>
  );
}

const styles = StyleSheet.create({
  logo: { width: HEADER_HEIGHT.value, height: HEADER_HEIGHT.value, borderRadius: 10 },
  wordmark: {
    fontFamily: fonts.display,
    fontSize: phoneLength('wordmark-size', 26).value,
    letterSpacing: 0.2,
  },
  tagline: { fontFamily: fonts.displayItalic, fontSize: 17 },
  rule: { height: 18, alignSelf: 'center' },
});
