import { type ReactNode, useSyncExternalStore } from 'react';
import {
  Dimensions,
  ScrollView,
  type StyleProp,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaFrame, useSafeAreaInsets } from 'react-native-safe-area-context';

import { SIDE_BY_SIDE_MIN } from '@/components/sideBySide';
import {
  NARROW_CSS_LOADS,
  NARROW_PX,
  NATIVE_PARTS,
  type NarrowPartName,
  type NarrowStyles,
  PX,
  type Px,
} from '@/theme/narrow';

/**
 * Whether the page is narrow, off the web: too narrow for the panel beside
 * the board, as narrow.css's media query decides it on the web. The one place
 * native reads the window's width; a component re-renders only when the
 * answer changes, not on every resize. The web can't tell (its pages are rendered
 * before there's a window), so it lets narrow.css decide.
 */
const useIsNarrow = NARROW_CSS_LOADS ? () => false : useIsNarrowWindow;

function useIsNarrowWindow() {
  return useSyncExternalStore(onResize, isNarrowWindow);
}

const isNarrowWindow = () => Dimensions.get('window').width < SIDE_BY_SIDE_MIN;

function onResize(change: () => void) {
  const subscription = Dimensions.addEventListener('change', change);
  return () => subscription.remove();
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
  return (part: NarrowPartName | false | undefined, style?: AnyStyle): PartProps => {
    const own = style === undefined ? {} : { style };
    if (!part) return own;
    if (NARROW_CSS_LOADS) return { dataSet: { narrow: part }, ...own };
    const { wide, narrow: narrowStyle, narrowProps } = NATIVE_PARTS[part];
    const added = narrow ? narrowStyle : wide;
    return { style: added ? [style, added] : style, ...(narrow ? narrowProps : {}) };
  };
}

/**
 * Children only a narrow page shows. They stay mounted on a wide page,
 * hidden, so a window crossing the width keeps their state.
 */
export function NarrowOnly({ children }: { readonly children: ReactNode }) {
  const part = useNarrowPart();
  return <View {...part('narrow-only')}>{children}</View>;
}

/** The parts that scroll on their own on a narrow page. */
type ScrollingPart = 'program' | 'moves-pane' | 'idea-pane';

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
  const part = useNarrowPart();
  if (NARROW_CSS_LOADS) return <View {...part(name, [style, contentStyle])}>{children}</View>;
  return (
    <ScrollView
      {...part(name, style)}
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

function useNativeViewport() {
  const narrow = useIsNarrow();
  // The frame the insets are measured in, so neither bar is taken off twice.
  const { height } = useSafeAreaFrame();
  const { top, bottom } = useSafeAreaInsets();
  return { px: narrow ? PX.narrow : PX.wide, height: height - top - bottom };
}
