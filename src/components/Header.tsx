import { Inline, Separator, Text } from '@reactive/silk-native';
import { Image, StyleSheet, View } from 'react-native';

import { PAGE_SPACE } from '@/components/sideBySide';
import { SOURCE_LINK_SIZE, SourceLink } from '@/components/SourceLink';
import { NARROW_CSS_LOADS, narrowLength, narrowPart } from '@/theme/narrow';
import { fonts, themes } from '@/theme/theme';

/** The header's height: its logo, the tallest thing in it. Shorter on a narrow web page. */
export const HEADER_HEIGHT = narrowLength('header-height', 40);

/** Where the page is: a name, such as the lesson's line, and what it is within, such as its parent. */
export interface Place {
  readonly name: string;
  readonly within?: string;
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
 * A narrow page's place: what it's within as an eyebrow, over its name in
 * the display serif, both in the logo's height. A long name shrinks to fit
 * its one line rather than lose its end, as far as `fitted` can tell.
 */
function PlaceName({ name, within }: Place) {
  return (
    // narrow.css shows the outer view as a block, so the inner one stacks the lines.
    <View {...narrowPart('narrow-only')} style={styles.place}>
      <View>
        {within ? (
          <Text role="caption" tone="secondary" numberOfLines={1} style={styles.within}>
            {within}
          </Text>
        ) : null}
        <Text
          role="heading"
          numberOfLines={1}
          style={[styles.name, { fontSize: fitted(name, within ? 15 : 17) }]}
        >
          {name}
        </Text>
      </View>
    </View>
  );
}

/** Silk's space steps between the header's two ends, and between the parts of each. */
const ENDS_GAP = '2';
const PARTS_GAP = '3';

/**
 * The width a narrow header leaves its place: the page less its padding,
 * the logo, the source link and the gaps beside them.
 */
const PLACE_WIDTH = `(100vw - ${
  PAGE_SPACE.times(2)
    .plus(HEADER_HEIGHT)
    .plus(SOURCE_LINK_SIZE)
    .plus(themes.dark.semantic.space[ENDS_GAP] + themes.dark.semantic.space[PARTS_GAP]).css
})`;

/**
 * Display serif text's width per character, in ems: names as long as a
 * header can't fit run under it. Shorter ones may run wider, but fit anyway.
 */
const EM_PER_CHARACTER = 0.46;

/**
 * A font size up to `largest` pixels at which `text` fits the place's width,
 * reckoned from its length since nothing measures text before it's drawn; no
 * smaller than 12 pixels, past which it ends in an ellipsis. A CSS string,
 * since only a narrow web page shows the place (typed as a number like
 * `narrowCalc`'s).
 */
function fitted(text: string, largest: number) {
  const ems = Math.max(text.length * EM_PER_CHARACTER, 1);
  return `clamp(12px, calc(${PLACE_WIDTH} / ${ems}), ${largest}px)` as unknown as number;
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
  within: { fontSize: 10, lineHeight: 12, textTransform: 'uppercase', letterSpacing: 1.2 },
  name: { fontFamily: fonts.display, lineHeight: 17 },
  tagline: { fontFamily: fonts.displayItalic, fontSize: 17 },
  rule: { height: 18, alignSelf: 'center' },
});
