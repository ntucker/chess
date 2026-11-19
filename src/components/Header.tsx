import { Inline, Separator, Text } from '@reactive/silk-native';
import { Image, StyleSheet } from 'react-native';

import { SourceLink } from '@/components/SourceLink';
import { NARROW_CSS_LOADS, narrowLength, narrowPart } from '@/theme/narrow';
import { fonts } from '@/theme/theme';

/** The header's height: its logo, the tallest thing in it. Shorter on a narrow web page. */
export const HEADER_HEIGHT = narrowLength('header-height', 40);

interface Props {
  /** Where the page is, such as the lesson's line. On a narrow web page it takes the name's place. */
  readonly place?: string;
}

/**
 * The wordmark (the logo, the name in the display serif, and the tagline),
 * with a link to the source at the far end. On a narrow web page it's
 * one slim row: a smaller logo, the page's `place` (or the name, when there
 * is none), and no tagline.
 */
export function Header({ place }: Props) {
  // Only narrow.css shows it, so a native app keeps the name.
  const shownPlace = NARROW_CSS_LOADS ? place : undefined;
  return (
    <Inline gap="2" align="center" justify="between" wrap="nowrap">
      <Inline gap="3" align="center" wrap="nowrap" style={styles.brand}>
        <Image
          source={require('@/assets/images/logo-mark.png')}
          style={styles.logo}
          accessibilityIgnoresInvertColors
        />
        <Text
          {...(shownPlace ? narrowPart('wide-only') : {})}
          role="heading"
          accessibilityRole="header"
          style={styles.wordmark}
        >
          Opening Night
        </Text>
        {shownPlace ? (
          <Text {...narrowPart('narrow-only')} role="heading" numberOfLines={1} style={styles.place}>
            {shownPlace}
          </Text>
        ) : null}
      </Inline>
      <Inline gap="3" align="center" wrap="nowrap">
        <Inline {...narrowPart('wide-only')} gap="3" align="center" wrap="nowrap">
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
    fontSize: narrowLength('wordmark-size', 26).value,
    letterSpacing: 0.2,
  },
  place: { fontFamily: fonts.display, fontSize: 17, flexShrink: 1, minWidth: 0 },
  tagline: { fontFamily: fonts.displayItalic, fontSize: 17 },
  rule: { height: 18, alignSelf: 'center' },
});
