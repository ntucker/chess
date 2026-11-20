import type { FocusEvent as ReactFocusEvent, ReactNode } from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';

import { hovers } from '@/board/pointer';
import { narrowPart } from '@/theme/narrow';

interface Props {
  /** The mouse, or the keyboard focus, left the area. */
  readonly onLeave: () => void;
  readonly children: ReactNode;
  /** Its spacing, as the panel's sections. */
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * The part of the panel the learner points into: what is pointed at inside
 * stays pointed at until the mouse leaves the area, or focus moves to
 * something else on the page. Focus that goes nowhere (a tap on plain text,
 * another window) leaves it up. Touch screens have neither, so on them it is
 * only a stack. On a narrow web page its children are panes side by side
 * (narrow.css).
 */
export function PointingArea({ onLeave, children, style }: Props) {
  // The DOM's own focus event, which bubbles from the buttons inside.
  const blur = (event: unknown) => {
    const { currentTarget, relatedTarget } = event as ReactFocusEvent<HTMLElement>;
    if (relatedTarget instanceof Node && !currentTarget.contains(relatedTarget)) onLeave();
  };
  return (
    // A View, not a Stack: narrow.css lays it out as a row, which a Stack's inline style would override.
    <View
      {...narrowPart('panes')}
      style={style}
      onPointerLeave={({ nativeEvent }) => {
        // A finger leaves whenever it lifts, which would end every preview a tap starts.
        if (hovers(nativeEvent.pointerType)) onLeave();
      }}
      // Only the web has keyboard focus here.
      onBlur={process.env.EXPO_OS === 'web' ? blur : undefined}
    >
      {children}
    </View>
  );
}
