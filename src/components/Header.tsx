import { Inline, Separator, Text } from '@reactive/silk-native';
import { Image, StyleSheet, View } from 'react-native';

import { BackButton } from '@/components/BackButton';
import { Eyebrow } from '@/components/Eyebrow';
import { CHEVRON_WIDTH, type Destination, PlaceLink } from '@/components/PlaceLink';
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

export interface HeaderProps {
  /** Where the page is. On a narrow web page it takes the app name's place. */
  readonly place?: Place;
  /** The place links to the screen listing the others (`PlaceLink`). */
  readonly placeLink?: Destination;
  /**
   * The page sits on top of another: a back button leads first, back to the
   * page underneath, or to this address when nothing is (`BackButton`).
   */
  readonly back?: Destination;
}

/**
 * The wordmark (the logo, the name in the display serif, and the tagline),
 * with a link to the source at the far end. On a narrow web page it's
 * one slim row: a smaller logo, the page's `place` (or the name, when there
 * is none), and no tagline. A page on top of another starts with a back button.
 */
export function Header({ place, placeLink, back }: HeaderProps) {
  // Only narrow.css shows it, so a native app keeps the name.
  const shownPlace = NARROW_CSS_LOADS ? place : undefined;
  return (
    <Inline gap="2" align="center" justify="between" wrap="nowrap">
      <Inline gap="3" align="center" wrap="nowrap" style={styles.brand}>
        {back ? <BackButton {...back} /> : null}
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
        {shownPlace ? <PlaceName {...shownPlace} link={placeLink} /> : null}
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
 * one line rather than lose its end, as far as `fitted` can tell. With a
 * `link`, it opens the screen listing the other places (`PlaceLink`).
 */
function PlaceName({ name, parent, link }: Place & { readonly link?: Destination }) {
  const { size, line } = parent ? PLACE_TYPE.underParent : PLACE_TYPE.alone;
  const fontSize = fitted(name, size, link ? CHEVRON_WIDTH : 0);
  return (
    <View {...narrowPart('place')} style={styles.place}>
      <PlaceLink to={link}>
        {(active) => (
          <View style={styles.placeText}>
            {parent ? (
              <Eyebrow
                tone={active ? 'primary' : 'secondary'}
                numberOfLines={1}
                style={styles.parent}
              >
                {parent}
              </Eyebrow>
            ) : null}
            <Text
              role="heading"
              accessibilityRole="header"
              numberOfLines={1}
              tone={active ? 'primary' : undefined}
              style={[styles.name, { fontSize, lineHeight: line }]}
            >
              {name}
            </Text>
          </View>
        )}
      </PlaceLink>
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
 * width (narrow.css makes it a size container) less `reserved` pixels,
 * reckoned from its length since nothing measures text before it's drawn.
 */
function fitted(text: string, largest: number, reserved: number) {
  const ems = Math.max(text.length * PLACE_TYPE.emPerCharacter, 1);
  return narrowCalc(
    `clamp(${PLACE_TYPE.smallest}px, (100cqw - ${reserved}px) / ${ems}, ${largest}px)`,
    largest,
  );
}

const styles = StyleSheet.create({
  // Fills the header but gives way to the source link, so the place gets what's left.
  brand: { flexGrow: 1, flexShrink: 1, minWidth: 0 },
  logo: { width: HEADER_HEIGHT.value, height: HEADER_HEIGHT.value, borderRadius: 10 },
  wordmark: {
    fontFamily: fonts.display,
    fontSize: narrowLength('wordmark-size', 26).value,
    letterSpacing: 0.2,
  },
  // Takes the width the brand leaves, since a size container has none of its own.
  place: { flex: 1, minWidth: 0 },
  placeText: { flexShrink: 1, minWidth: 0 },
  parent: { fontSize: 10, lineHeight: PARENT_LINE, letterSpacing: 1.2 },
  name: { fontFamily: fonts.display },
  tagline: { fontFamily: fonts.displayItalic, fontSize: 17 },
  rule: { height: 18, alignSelf: 'center' },
});
