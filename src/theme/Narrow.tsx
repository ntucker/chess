import { type ReactNode, useSyncExternalStore } from 'react';
import { ScrollView, type StyleProp, type TextStyle, View, type ViewStyle } from 'react-native';
import { useSafeAreaFrame, useSafeAreaInsets } from 'react-native-safe-area-context';

import { NARROW_PAGE_MIN, SIDE_BY_SIDE_MIN } from '@/theme/sideBySide';
import {
  NARROW_CSS_LOADS,
  NARROW_PX,
  NATIVE_PARTS,
  type NarrowPartName,
  type NarrowStyles,
  PX,
  type Px,
  type ScrollingPart,
  PAGED_PARTS,
} from '@/theme/narrow';

/**
 * Whether the page is narrow, off the web: too narrow for the panel beside
 * the board, as narrow.css's media query decides it on the web. Native
 * decides it from the room the page lays out in (`useNativeArea`). The web
 * can't tell (its pages are rendered before there's a window), so it lets
 * narrow.css decide.
 */
const useIsNarrow = NARROW_CSS_LOADS ? () => false : useIsNarrowArea;

function useIsNarrowArea() {
  return useNativeArea().width < SIDE_BY_SIDE_MIN;
}

/**
 * The room the page lays out in natively: the app's frame less its system
 * bars and cutouts, which the page's safe area keeps it out of (Page.tsx).
 * The one place native reads the window's size.
 */
function useNativeArea() {
  // The frame the insets are measured in, so no bar is taken off twice.
  const { width, height } = useSafeAreaFrame();
  const { top, bottom, left, right } = useSafeAreaInsets();
  return { width: width - left - right, height: height - top - bottom };
}

/**
 * Where a screen puts its panel: under the board (`phone`) or beside it
 * (`wide`), as narrow.css decides it on the web.
 */
type ScreenLayout = 'phone' | 'wide';

/** narrow.css's media query: just below where the board column and the panel fit side by side. */
export const PHONE_QUERY = `(max-width: ${SIDE_BY_SIDE_MIN - 0.02}px)`;

/**
 * The screen's layout, for a screen that draws a different panel on a
 * phone. Only a screen calls it (lint), and hands its blocks a `Density`:
 * a component that can pre-render takes its parts from narrow.css instead.
 * On the web it reads the media query on the first render, so a phone
 * never draws the wide panel first; a pre-rendered page has no window, so
 * calling it outside `BrowserOnly` fails the export.
 */
export const useLayout: () => ScreenLayout = NARROW_CSS_LOADS
  ? () => (usePhoneMedia() ? 'phone' : 'wide')
  : () => (useIsNarrowArea() ? 'phone' : 'wide');

/**
 * Whether a narrow page is too short for the board at its smallest and the
 * panel at its floor, so it scrolls (narrow.css on the web, natively
 * `useNarrowPageHeight`). It reads the height alone, so ask it only on a
 * narrow page. A pre-rendered page, which has no window, says it doesn't.
 */
export const useNarrowPageScrolls: () => boolean = NARROW_CSS_LOADS
  ? mediaHook(`(max-height: ${NARROW_PAGE_MIN - 0.02}px)`, () => false)
  : () => useNativeArea().height < NARROW_PAGE_MIN;

/**
 * A hook saying whether `query` matches, and `server` before there's a
 * window. It matches on first use: a module the export loads has no window.
 */
function mediaHook(query: string, server: () => boolean) {
  let list: MediaQueryList | undefined;
  const matched = () => (list ??= matchMedia(query));
  const subscribe = (change: () => void) => {
    const watched = matched();
    watched.addEventListener('change', change);
    return () => watched.removeEventListener('change', change);
  };
  const matches = () => matched().matches;
  return () => useSyncExternalStore(subscribe, matches, server);
}

const usePhoneMedia = mediaHook(PHONE_QUERY, noWindow);

function noWindow(): never {
  throw new Error(
    'useLayout reads the window, which a pre-rendered page lacks: call it under BrowserOnly.',
  );
}

/** How much room a block has: a phone's panes (`compact`) or a wide panel's. */
export type Density = 'comfortable' | 'compact';

/** The styles of `narrowStyles` for the page as it is. */
export function useNarrowStyles<T>(styles: NarrowStyles<T>): T {
  return useIsNarrow() ? styles.narrow : styles.wide;
}

type Style = StyleProp<ViewStyle>;

/** An element's style, of whatever kind of element (a text's style is a view's and more). */
type AnyStyle = StyleProp<TextStyle>;

/** The props naming a part, with the element's own style. */
interface PartProps {
  readonly dataSet?: { readonly narrow: NarrowPartName };
  readonly style?: AnyStyle;
}

/**
 * A function giving the props that name a part of the page, with the
 * element's own `style`: spread them last. On the web they tag the element
 * for narrow.css; elsewhere they add the part's style (`NATIVE_PARTS`) for the
 * page as it is, after the element's own, as narrow.css's rules win over it.
 * With no part (`false` or `undefined`), they hold only the element's style.
 */
export function useNarrowPart() {
  const narrow = useIsNarrow();
  return (part: Exclude<NarrowPartName, ScrollingPart> | false | undefined, style?: AnyStyle) =>
    partProps(narrow, part, style);
}

function partProps(
  narrow: boolean,
  part: NarrowPartName | false | undefined,
  style: AnyStyle,
): PartProps {
  const own = style === undefined ? {} : { style };
  if (!part) return own;
  if (NARROW_CSS_LOADS) return { dataSet: { narrow: part }, ...own };
  const { wide, narrow: narrowStyle } = NATIVE_PARTS[part];
  const added = narrow ? narrowStyle : wide;
  return { style: added ? [style, added] : style };
}

/**
 * Children only a narrow page shows. They stay mounted on a wide page,
 * hidden, so a window crossing the width keeps their state. `aria-hidden`
 * keeps screen readers out of them, for children that repeat what they hear
 * elsewhere.
 */
export function NarrowOnly({
  children,
  style,
  'aria-hidden': hidden,
}: {
  readonly children: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
  readonly 'aria-hidden'?: boolean;
}) {
  const part = useNarrowPart();
  return (
    <View aria-hidden={hidden} {...part('narrow-only', style)}>
      {children}
    </View>
  );
}

/**
 * A part that scrolls on its own on a narrow page, fading out its bottom edge
 * to show there's more below, with room for its last line to clear the fade.
 * On the web narrow.css does it to a plain view. Elsewhere it is always a
 * scroll view, scrolling only on a narrow page, so crossing the width keeps
 * what it holds.
 */
export function NarrowScroll({
  part: name,
  style,
  children,
}: {
  readonly part: ScrollingPart;
  readonly style?: Style;
  readonly children: ReactNode;
}) {
  const narrow = useIsNarrow();
  if (NARROW_CSS_LOADS) {
    return <View {...partProps(narrow, name, style)}>{children}</View>;
  }
  const fades = narrow && !(PAGED_PARTS as readonly ScrollingPart[]).includes(name);
  return (
    <ScrollView
      {...partProps(narrow, name, style)}
      contentContainerStyle={fades && FADED}
      scrollEnabled={narrow}
      nestedScrollEnabled
      fadingEdgeLength={fades ? FADING_EDGE : 0}
    >
      {children}
    </ScrollView>
  );
}

const FADED = { flexGrow: 1, paddingBottom: NARROW_PX.fade } as const satisfies ViewStyle;
const FADING_EDGE = { start: 0, end: NARROW_PX.fade };

/**
 * A pane that always scrolls on its own, such as a phone's moves or the idea
 * beside them, faded at its foot as `NarrowScroll` fades the panel around
 * it: the web masks the edge, Android fades it itself. A scroll that reaches
 * an end stops there rather than scroll the panel on.
 */
export function FadingScroll({
  style,
  contentStyle,
  children,
}: {
  readonly style?: Style;
  readonly contentStyle?: Style;
  readonly children: ReactNode;
}) {
  return (
    <ScrollView
      style={[PANE_FADE, style]}
      contentContainerStyle={[{ paddingBottom: NARROW_PX.fade }, contentStyle]}
      showsVerticalScrollIndicator={false}
      nestedScrollEnabled
      fadingEdgeLength={FADING_EDGE}
    >
      {children}
    </ScrollView>
  );
}

/**
 * A vertical scroller's panning on the web: up and down, and zoom, never
 * sideways, so a sideways swipe in it reaches a pager around it. It goes on
 * the scroller itself: a browser may read touch-action only up to the
 * nearest scroller (Firefox on Android does), past the pager's own `pan-y`.
 */
export const VERTICAL_PAN = (
  NARROW_CSS_LOADS ? { touchAction: 'pan-y pinch-zoom' } : {}
) as ViewStyle;

const PANE_FADE = (
  NARROW_CSS_LOADS
    ? {
        ...VERTICAL_PAN,
        overscrollBehavior: 'contain',
        // A mask reads only alpha, so black here is opaque, not a theme color.
        maskImage: `linear-gradient(to bottom, black calc(100% - ${NARROW_PX.fade}px), transparent)`,
      }
    : {}
) as ViewStyle;

/**
 * Off the web, the app's height less its system bars, and the pixels of
 * narrow lengths there; on the web nothing, as CSS fits to the window itself.
 */
export const useNarrowViewport: () => { readonly px: Px; readonly height: number } | undefined =
  NARROW_CSS_LOADS ? () => undefined : useNativeViewport;

/**
 * Off the web, a narrow page's height: the app's, less its system bars, or
 * what the board at its smallest and the panel at its reserve need, if more
 * (the page then scrolls). A definite height, so the panel below the board
 * gets what the board leaves: Yoga ignores a zero flex basis in a scroll
 * view's content otherwise. None on a wide page, which grows to its
 * content, or on the web, where narrow.css's `min-height: 100dvh` does it.
 */
export const useNarrowPageHeight: () => number | undefined = NARROW_CSS_LOADS
  ? () => undefined
  : useNativePageHeight;

function useNativePageHeight() {
  const { width, height } = useNativeArea();
  return width < SIDE_BY_SIDE_MIN ? Math.max(height, NARROW_PAGE_MIN) : undefined;
}

function useNativeViewport() {
  const { width, height } = useNativeArea();
  return { px: width < SIDE_BY_SIDE_MIN ? PX.narrow : PX.wide, height };
}
