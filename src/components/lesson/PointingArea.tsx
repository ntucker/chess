import type { FocusEvent as ReactFocusEvent, ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';

import { hovers } from '@/board/pointer';

interface Props extends Omit<ViewProps, 'onPointerLeave' | 'onBlur'> {
  /** The mouse, or the keyboard focus, left the area. */
  readonly onLeave: () => void;
  readonly children: ReactNode;
}

/**
 * The part of the panel the learner points into: what is pointed at inside
 * stays pointed at until the mouse leaves the area, or focus moves to
 * something else on the page. Focus that goes nowhere (a tap on plain text,
 * another window) leaves it up. Touch screens have neither, so on them it is
 * only a View, laid out by the caller.
 */
export function PointingArea({ onLeave, children, ...view }: Props) {
  // The DOM's own focus event, which bubbles from the buttons inside.
  const blur = (event: unknown) => {
    const { currentTarget, relatedTarget } = event as ReactFocusEvent<HTMLElement>;
    if (relatedTarget instanceof Node && !currentTarget.contains(relatedTarget)) onLeave();
  };
  return (
    <View
      {...view}
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
