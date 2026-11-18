import { Inline, Text, useTheme } from '@reactive/silk-native';
import { Image, StyleSheet, View } from 'react-native';

import { SourceLink } from '@/components/SourceLink';
import { fonts } from '@/theme/theme';

/**
 * The wordmark (the logo, the name in the display serif, and the tagline),
 * with a link to the source at the far end.
 */
export function Header() {
  const { theme } = useTheme();
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
        <View style={[styles.rule, { backgroundColor: theme.semantic.color.borderSubtle }]} />
        <SourceLink />
      </Inline>
    </Inline>
  );
}

const styles = StyleSheet.create({
  logo: { width: 40, height: 40, borderRadius: 10 },
  wordmark: { fontFamily: fonts.display, fontSize: 26, letterSpacing: 0.2 },
  tagline: { fontFamily: fonts.displayItalic, fontSize: 17 },
  rule: { width: StyleSheet.hairlineWidth, height: 18 },
});
