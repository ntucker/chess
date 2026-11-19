import { Stack } from '@reactive/silk-native';
import type { FocusEvent as ReactFocusEvent, ReactNode } from 'react';

interface Props {
  /** The pointer, or the keyboard focus, left the area. */
  readonly onLeave: () => void;
  readonly children: ReactNode;
}

/**
 * The part of the panel the learner points into: what is pointed at inside
 * stays pointed at until the mouse leaves the area, or keyboard focus moves
 * out of it. Touch screens have neither, so on them it is only a stack.
 */
export function PointingArea({ onLeave, children }: Props) {
  return (
    <Stack
      gap="5"
      onPointerLeave={({ nativeEvent }) => {
        // A finger leaves whenever it lifts, which would end every preview a tap starts.
        if (nativeEvent.pointerType === 'mouse') onLeave();
      }}
      onBlur={(event) => {
        // On the web this is the DOM's own focus event, which bubbles from
        // the buttons inside: focus that moves to another of them stays in.
        const { currentTarget, relatedTarget } = event as unknown as ReactFocusEvent<HTMLElement>;
        if (!(relatedTarget instanceof Node && currentTarget.contains(relatedTarget))) onLeave();
      }}
    >
      {children}
    </Stack>
  );
}
