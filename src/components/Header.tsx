import { Inline, Separator, Text } from '@reactive/silk-native';
import { Image, StyleSheet } from 'react-native';

import { SourceLink } from '@/components/SourceLink';
import { phoneLength, phonePart } from '@/theme/phone';
import { fonts } from '@/theme/theme';

/** The header's height: its logo, the tallest thing in it. Shorter on a phone. */
export const HEADER_HEIGHT = phoneLength('header-height', 40);

interface Props {
  /** Where the page is, such as the lesson's line. On a phone it takes the name's place. */
  readonly place?: string;
}

/**
 * The wordmark (the logo, the name in the display serif, and the tagline),
 * with a link to the source at the far end. On a phone-width web page it's
 * one slim row: a smaller logo, the page's `place` (or the name, when there
 * is none), and no tagline.
 */
export function Header({ place: shownPlace }: Props) {
  // Only phone.css shows it, so a native app keeps the name.
  const place = process.env.EXPO_OS === 'web' ? shownPlace : undefined;
  return (
    <Inline gap="2" align="center" justify="between" wrap="nowrap">
      <Inline gap="3" align="center" wrap="nowrap" style={styles.brand}>
        <Image
          source={require('@/assets/images/logo-mark.png')}
          style={styles.logo}
          accessibilityIgnoresInvertColors
        />
        <Text
          {...(place ? phonePart('wordmark') : {})}
          role="heading"
          accessibilityRole="header"
          style={styles.wordmark}
        >
          Opening Night
        </Text>
        {place ? (
          <Text {...phonePart('place')} role="heading" numberOfLines={1} style={styles.place}>
            {place}
          </Text>
        ) : null}
      </Inline>
      <Inline gap="3" align="center" wrap="nowrap">
        <Inline {...phonePart('tagline')} gap="3" align="center" wrap="nowrap">
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
  // Gives way to the source link, so a long place ends in an ellipsis.
  brand: { flexShrink: 1, minWidth: 0 },
  logo: { width: HEADER_HEIGHT.value, height: HEADER_HEIGHT.value, borderRadius: 10 },
  wordmark: {
    fontFamily: fonts.display,
    fontSize: phoneLength('wordmark-size', 26).value,
    letterSpacing: 0.2,
  },
  place: { fontFamily: fonts.display, fontSize: 17, flexShrink: 1, minWidth: 0 },
  tagline: { fontFamily: fonts.displayItalic, fontSize: 17 },
  rule: { height: 18, alignSelf: 'center' },
});
