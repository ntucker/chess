import { Inline, Separator, Text } from '@reactive/silk-native';
import { Image, StyleSheet, View } from 'react-native';

import { Eyebrow } from '@/components/Eyebrow';
import { PAGE_SPACE } from '@/components/sideBySide';
import { SOURCE_LINK_SIZE, SourceLink } from '@/components/SourceLink';
import { NARROW_CSS_LOADS, narrowCalc, narrowLength, narrowPart } from '@/theme/narrow';
import { fonts, themes } from '@/theme/theme';

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
    <Inline gap={ENDS_GAP} align="center" justify="between" wrap="nowrap">
      <Inline gap={PARTS_GAP} align="center" wrap="nowrap" style={styles.brand}>
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
      <Inline gap={PARTS_GAP} align="center" wrap="nowrap">
        <Inline {...narrowPart('wide-only')} gap={PARTS_GAP} align="center" wrap="nowrap">
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
  const largest = parent ? NAME_SIZE : LONE_NAME_SIZE;
  return (
    // narrow.css shows the outer view as a block, so the inner one stacks the lines.
    <View {...narrowPart('narrow-only')} style={styles.place}>
      <View>
        {parent ? (
          <Eyebrow numberOfLines={1} style={styles.parent}>
            {parent}
          </Eyebrow>
        ) : null}
        <Text
          role="heading"
          accessibilityRole="header"
          numberOfLines={1}
          style={[
            styles.name,
            { fontSize: fitted(name, largest), lineHeight: parent ? NAME_LINE : LONE_NAME_LINE },
          ]}
        >
          {name}
        </Text>
      </View>
    </View>
  );
}

/** The place's lines, as tall together as a narrow header (narrow.css `--header-height`). */
export const PARENT_LINE = 11;
export const NAME_LINE = 17;
/** A name alone gets room for its descenders, which a line as tall as the font clips. */
export const LONE_NAME_LINE = 22;
/** The name's largest size, under a parent or alone, and the smallest it shrinks to. */
const NAME_SIZE = 15;
const LONE_NAME_SIZE = 17;
export const SMALLEST_NAME_SIZE = 12;

/** Silk's space steps between the header's two ends, and between the parts of each. */
const ENDS_GAP = '2';
const PARTS_GAP = '3';

/**
 * The width a narrow header leaves its place: the page less its padding,
 * the logo, the source link and the gaps beside them.
 */
export const PLACE_CHROME = PAGE_SPACE.times(2)
  .plus(HEADER_HEIGHT)
  .plus(SOURCE_LINK_SIZE)
  .plus(themes.dark.semantic.space[ENDS_GAP] + themes.dark.semantic.space[PARTS_GAP]);

/**
 * An estimate of a display serif name's width per character, in ems: the
 * widest that names of 30 or more characters run (about 0.46 in the shipped
 * lessons), with a little to spare. A name that runs wider than this ends in
 * an ellipsis; shorter names may, but they fit without shrinking.
 */
export const EM_PER_CHARACTER = 0.48;

/**
 * A font size up to `largest` pixels at which `text` fits the place's width,
 * reckoned from its length since nothing measures text before it's drawn; no
 * smaller than `SMALLEST_NAME_SIZE`, past which it ends in an ellipsis.
 */
function fitted(text: string, largest: number) {
  const ems = Math.max(text.length * EM_PER_CHARACTER, 1);
  return narrowCalc(
    `clamp(${SMALLEST_NAME_SIZE}px, (100vw - ${PLACE_CHROME.css}) / ${ems}, ${largest}px)`,
    largest,
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
  place: { flexShrink: 1, minWidth: 0 },
  parent: { fontSize: 10, lineHeight: PARENT_LINE, letterSpacing: 1.2 },
  name: { fontFamily: fonts.display },
  tagline: { fontFamily: fonts.displayItalic, fontSize: 17 },
  rule: { height: 18, alignSelf: 'center' },
});
