import type { ReactNode } from 'react';
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
  readonly numberOfLines?: number;
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
  const { wide, narrow: narrowStyle, narrowProps } = NATIVE_PARTS[part];
  const added = narrow ? narrowStyle : wide;
  return { style: added ? [style, added] : style, ...(narrow ? narrowProps : {}) };
}

/**
 * Children only a narrow page shows. They stay mounted on a wide page,
 * hidden, so a window crossing the width keeps their state.
 */
export function NarrowOnly({ children }: { readonly children: ReactNode }) {
  const part = useNarrowPart();
  return <View {...part('narrow-only')}>{children}</View>;
}

/**
 * A part that scrolls on its own on a narrow page, fading out its bottom edge
 * to show there's more below, with room for its last line to clear the fade.
 * On the web narrow.css does it to a plain view, which `contentStyle` styles
 * too. Elsewhere it is always a scroll view, scrolling only on a narrow page,
 * so crossing the width keeps what it holds.

 */
export function NarrowScroll({
  part: name,
  style,
  contentStyle,
  children,
}: {
  readonly part: ScrollingPart;
  readonly style?: Style;
  readonly contentStyle?: Style;
  readonly children: ReactNode;
}) {
  const narrow = useIsNarrow();
  if (NARROW_CSS_LOADS) {
    return <View {...partProps(narrow, name, [style, contentStyle])}>{children}</View>;
  }
  return (
    <ScrollView
      {...partProps(narrow, name, style)}
      contentContainerStyle={[contentStyle, narrow && FADED]}
      scrollEnabled={narrow}
      nestedScrollEnabled
      fadingEdgeLength={narrow ? FADING_EDGE : 0}
    >
      {children}
    </ScrollView>
  );
}

const FADED = { flexGrow: 1, paddingBottom: NARROW_PX.fade } as const satisfies ViewStyle;
const FADING_EDGE = { start: 0, end: NARROW_PX.fade };

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
