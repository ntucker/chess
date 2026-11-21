import { Inline, Pressable, Separator, Text } from '@reactive/silk-native';
import { Image, View } from 'react-native';

import { BackButton } from '@/components/BackButton';
import { Eyebrow } from '@/components/Eyebrow';
import { HeaderButton } from '@/components/HeaderButton';
import { CHEVRON_WIDTH, type Destination, PlaceLink } from '@/components/PlaceLink';
import { HEADER_HEIGHT } from '@/theme/sideBySide';
import { SourceLink } from '@/components/SourceLink';
import { NARROW_CSS_LOADS, narrowCalc, narrowLength, narrowStyles } from '@/theme/narrow';
import { NarrowOnly, useNarrowPart, useNarrowStyles } from '@/theme/Narrow';
import { fonts } from '@/theme/theme';

/** Where the page is: a name, such as the lesson's line, and its parent, such as the line it branches from. */
export interface Place {
  readonly name: string;
  readonly parent?: string;
}

export interface HeaderProps {
  /** Where the page is. On a narrow page it takes the app name's place. */
  readonly place?: Place;
  /** The place links to the screen listing the others (`PlaceLink`). */
  readonly placeLink?: Destination;
  /**
   * The page sits on top of another: a back button leads first, back to the
   * page underneath, or to this address when nothing is (`BackButton`).
   */
  readonly back?: Destination;
  /**
   * Opens the page's settings, which a narrow page keeps in a sheet: there
   * a settings button takes the source link's place, so the sheet should link
   * to the source (`SourceFootnote`). Elsewhere the page shows its settings
   * itself, and no button shows.
   */
  readonly onSettings?: () => void;
  /** The logo starts the board over from its start position; without it, the logo is only a picture. */
  readonly onRestart?: () => void;
}

/**
 * The wordmark (the logo, the name in the display serif, and the tagline),
 * with a link to the source at the far end. On a narrow page it's
 * one slim row: a smaller logo, the page's `place` (or the name, when there
 * is none), and no tagline. A page on top of another starts with a back button.
 */
export function Header({ place, placeLink, back, onSettings, onRestart }: HeaderProps) {
  const styles = useNarrowStyles(STYLES);
  const part = useNarrowPart();
  const logo = (
    <Image
      source={require('@/assets/images/logo-mark.png')}
      style={styles.logo}
      accessibilityIgnoresInvertColors
    />
  );
  return (
    <Inline gap="2" align="center" justify="between" wrap="nowrap">
      <Inline gap="3" align="center" wrap="nowrap" style={styles.brand}>
        {back ? <BackButton {...back} /> : null}
        {onRestart ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Start over"
            onPress={onRestart}
            style={({ pressed, hovered }) => [
              styles.logoButton,
              (pressed || hovered) && styles.dimmed,
            ]}
          >
            {logo}
          </Pressable>
        ) : (
          logo
        )}
        <Text
          role="heading"
          accessibilityRole="header"
          {...part(Boolean(place) && 'wide-only', styles.wordmark)}
        >
          Opening Night
        </Text>
        {place ? <PlaceName {...place} link={placeLink} /> : null}
      </Inline>
      <Inline gap="3" align="center" wrap="nowrap">
        <Inline gap="3" align="center" wrap="nowrap" {...part('wide-only')}>
          <Text role="caption" tone="secondary" style={styles.tagline}>
            Learn your lines
          </Text>
          <Separator orientation="vertical" style={styles.rule} />
        </Inline>
        <View {...part(Boolean(onSettings) && 'wide-only')}>
          <SourceLink />
        </View>
        {onSettings ? (
          <NarrowOnly>
            <HeaderButton
              icon="settings-outline"
              iconSize={19}
              accessibilityRole="button"
              accessibilityLabel="Settings"
              onPress={onSettings}
            />
          </NarrowOnly>
        ) : null}
      </Inline>
    </Inline>
  );
}

/**
 * A narrow page's place: its parent as an eyebrow over its name in the
 * display serif, both in the logo's height. A long name shrinks to fit its
 * one line rather than lose its end, as far as `fitted` can tell (natively,
 * as far as the text's own fitting can). With a
 * `link`, it opens the screen listing the other places (`PlaceLink`).
 */
function PlaceName({ name, parent, link }: Place & { readonly link?: Destination }) {
  const styles = useNarrowStyles(STYLES);
  const part = useNarrowPart();
  const size = parent ? PLACE_TYPE.underParent : PLACE_TYPE.alone;
  const fontSize = fitted(name, size, link ? CHEVRON_WIDTH : 0);
  return (
    <View {...part('place', styles.place)}>
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
              {...nativeFit(size)}
              tone={active ? 'primary' : undefined}
              style={[
                styles.name,
                parent ? styles.nameUnderParent : styles.nameAlone,
                { fontSize },
              ]}
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
  underParent: 15,
  /** Alone, in the header's height: room for descenders a line as tall as the font clips. */
  alone: 17,
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

/**
 * Off the web, a long name shrinks to fit by the text's own fitting, from its
 * largest size (where `fitted` leaves it) down to the smallest.
 */
const nativeFit = (largest: number) =>
  NARROW_CSS_LOADS
    ? {}
    : { adjustsFontSizeToFit: true, minimumFontScale: PLACE_TYPE.smallest / largest };

const LOGO_RADIUS = 10;

const STYLES = narrowStyles((px) => ({
  // Fills the header but gives way to the source link, so the place gets what's left.
  brand: { flexGrow: 1, flexShrink: 1, minWidth: 0 },
  logo: { width: px(HEADER_HEIGHT), height: px(HEADER_HEIGHT), borderRadius: LOGO_RADIUS },
  // Rounded like the logo, so the focus ring follows its corners.
  logoButton: { borderRadius: LOGO_RADIUS },
  // An image has no ink to light up, as the header's icon buttons do, so it dims.
  dimmed: { opacity: 0.85 },
  wordmark: {
    fontFamily: fonts.display,
    fontSize: px(narrowLength('wordmark-size', 26)),
    letterSpacing: 0.2,
  },
  // Takes the width the brand leaves, since a size container has none of its own.
  place: { flex: 1, minWidth: 0 },
  placeText: { flexShrink: 1, minWidth: 0 },
  parent: { fontSize: 10, lineHeight: PARENT_LINE, letterSpacing: 1.2 },
  name: { fontFamily: fonts.display },
  nameUnderParent: { lineHeight: px(HEADER_HEIGHT.minus(PARENT_LINE)) },
  nameAlone: { lineHeight: px(HEADER_HEIGHT) },
  tagline: { fontFamily: fonts.displayItalic, fontSize: 17 },
  rule: { height: 18, alignSelf: 'center' },
}));
