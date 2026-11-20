import type { ReactNode } from 'react';
import {
  ScrollView,
  type StyleProp,
  type TextStyle,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SIDE_BY_SIDE_MIN } from '@/components/sideBySide';
import {
  NARROW_CSS_LOADS,
  NARROW_PX,
  NATIVE_PARTS,
  type NarrowPartName,
  type NarrowStyles,
  type Px,
} from '@/theme/narrow';

/**
 * Whether the page is narrow, off the web: too narrow for the panel beside
 * the board, as narrow.css's media query decides it on the web. The one place
 * native reads the window's width. The web can't tell (its pages are rendered
 * before there's a window), so it lets narrow.css decide.
 */
const useIsNarrow = NARROW_CSS_LOADS
  ? () => false
  : () => useWindowDimensions().width < SIDE_BY_SIDE_MIN;

/** The styles of `narrowStyles` for the page as it is. */
export function useNarrowStyles<T>(styles: NarrowStyles<T>): T {
  return useIsNarrow() ? styles.narrow : styles.wide;
}

type Style = StyleProp<ViewStyle>;

/** The props naming a part, with the element's own style, of whatever kind of element. */
interface PartProps<S> {
  readonly dataSet?: { readonly narrow: NarrowPartName };
  readonly style?: S;
  readonly numberOfLines?: number;
}

/**
 * A function giving the props that name a part of the page, with the
 * element's own `style`: spread them last. On the web they tag the element
 * for narrow.css; elsewhere they add the part's style (`NATIVE_PARTS`) for the
 * page as it is, after the element's own, as narrow.css's rules win over it.
 */
export function useNarrowPart() {
  const narrow = useIsNarrow();
  return <S extends StyleProp<ViewStyle | TextStyle> = undefined>(
    part: NarrowPartName,
    style?: S,
  ): PartProps<S> => {
    if (NARROW_CSS_LOADS) {
      return { dataSet: { narrow: part }, ...(style === undefined ? {} : { style }) };
    }
    const { wide, narrow: narrowStyle, narrowProps } = NATIVE_PARTS[part];
    // A part's style suits any element: its own kind of style, as far as the types go.
    const merged = [style, narrow ? narrowStyle : wide] as unknown as S;
    return { style: merged, ...(narrow ? narrowProps : {}) };
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
      fadingEdgeLength={narrow ? { start: 0, end: NARROW_PX.fade } : 0}
    >
      {children}
    </ScrollView>
  );
}

const FADED = { flexGrow: 1, paddingBottom: NARROW_PX.fade } as const satisfies ViewStyle;

/**
 * Off the web, the window's height less its system bars, and the pixels of
 * narrow lengths there; on the web nothing, as CSS fits to the window itself.
 */
export const useNarrowViewport: () => { readonly px: Px; readonly height: number } | undefined =
  NARROW_CSS_LOADS
    ? () => undefined
    : () => {
        const narrow = useIsNarrow();
        const { height } = useWindowDimensions();
        const { top, bottom } = useSafeAreaInsets();
        return {
          px: (length) => (narrow ? length.narrow : length.wide),
          height: height - top - bottom,
        };
      };
