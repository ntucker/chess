import { Inline, Separator, Text } from '@reactive/silk-native';
import { Image, StyleSheet, View } from 'react-native';

import { Eyebrow } from '@/components/Eyebrow';
import { SourceLink } from '@/components/SourceLink';
import { NARROW_CSS_LOADS, narrowCalc, narrowLength, narrowPart } from '@/theme/narrow';
import { fonts } from '@/theme/theme';

/** The header's height: its logo, the tallest thing in it. Shorter on a narrow web page. */
export const HEADER_HEIGHT = narrowLength('header-height', 40);

/** Where the page is: a name, such as the lesson's line, and its parent, such as the line it branches from. */
export interface Place {
  readonly name: string;
  readonly parent?: string;
}

interface Props {
  /** Where the page is. On a narrow web page it takes the app name's place. */
  readonly place?: Place;
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
        {shownPlace ? <PlaceName {...shownPlace} /> : null}
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

/**
 * A narrow page's place: its parent as an eyebrow over its name in the
 * display serif, both in the logo's height. A long name shrinks to fit its
 * one line rather than lose its end, as far as `fitted` can tell.
 */
function PlaceName({ name, parent }: Place) {
  const { size, line } = parent ? PLACE_TYPE.underParent : PLACE_TYPE.alone;
  return (
    <View {...narrowPart('place')} style={styles.place}>
      {parent ? (
        <Eyebrow numberOfLines={1} style={styles.parent}>
          {parent}
        </Eyebrow>
      ) : null}
      <Text
        role="heading"
        accessibilityRole="header"
        numberOfLines={1}
        style={[styles.name, { fontSize: fitted(name, size), lineHeight: line }]}
      >
        {name}
      </Text>
    </View>
  );
}

/** The parent's line, over the name's. */
const PARENT_LINE = 11;

/** The place's type. */
export const PLACE_TYPE = {
  /** The name's largest size under a parent, in the header's height less the parent's line. */
  underParent: { size: 15, line: HEADER_HEIGHT.minus(PARENT_LINE).value },
  /** Alone, it has the header's height, room for descenders a line as tall as the font clips. */
  alone: { size: 17, line: HEADER_HEIGHT.value },
  /** The smallest size a name shrinks to; past it, it ends in an ellipsis. */
  smallest: 12,
  /**
   * An estimate of a name's width per character, in ems: the widest that
   * names of 30 or more characters run (about 0.46 in the shipped lessons),
   * with a little to spare. A name that runs wider ends in an ellipsis;
   * shorter names may, but they fit without shrinking.
   */
  emPerCharacter: 0.48,
};

/**
 * A font size up to `largest` pixels at which `text` fits the place's own
 * width (narrow.css makes it a size container), reckoned from its length
 * since nothing measures text before it's drawn.
 */
function fitted(text: string, largest: number) {
  const ems = Math.max(text.length * PLACE_TYPE.emPerCharacter, 1);
  return narrowCalc(`clamp(${PLACE_TYPE.smallest}px, 100cqw / ${ems}, ${largest}px)`, largest);
}

const styles = StyleSheet.create({
  // Gives way to the source link, so a long place ends in an ellipsis.
  brand: { flexGrow: 1, flexShrink: 1, minWidth: 0 },
  logo: { width: HEADER_HEIGHT.value, height: HEADER_HEIGHT.value, borderRadius: 10 },
  wordmark: {
    fontFamily: fonts.display,
    fontSize: narrowLength('wordmark-size', 26).value,
    letterSpacing: 0.2,
  },
  // Takes the width the brand leaves, since a size container has none of its own.
  place: { flex: 1, minWidth: 0 },
  parent: { fontSize: 10, lineHeight: PARENT_LINE, letterSpacing: 1.2 },
  name: { fontFamily: fonts.display },
  tagline: { fontFamily: fonts.displayItalic, fontSize: 17 },
  rule: { height: 18, alignSelf: 'center' },
});
