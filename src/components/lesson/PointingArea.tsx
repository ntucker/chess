import { Stack } from '@reactive/silk-native';
import { type FocusEvent as ReactFocusEvent, type ReactNode, useRef } from 'react';

import { hovers } from '@/board/pointer';

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
  // A press inside the area whose focus change hasn't come yet. On a touch
  // screen it comes after the finger lifts, so the press ends with the next
  // focus or blur. Focus a press moves to nowhere came from a tap or click on
  // something that takes no focus, such as a note's words, which the pointer
  // handles, not the keyboard.
  const pressed = useRef(false);
  // The DOM's own focus events, which bubble from the buttons inside: focus
  // that moves to another of them stays in, and so does focus a press inside
  // moves to nowhere. Any other blur leaves: Tab past the last button, a tap
  // outside, or another window.
  const blur = (event: unknown) => {
    const { currentTarget, relatedTarget } = event as ReactFocusEvent<HTMLElement>;
    const stays =
      relatedTarget instanceof Node ? currentTarget.contains(relatedTarget) : pressed.current;
    pressed.current = false;
    if (!stays) onLeave();
  };
  const web = process.env.EXPO_OS === 'web';
  return (
    <Stack
      gap="5"
      onPointerDown={() => {
        pressed.current = true;
      }}
      onPointerLeave={({ nativeEvent }) => {
        // A finger leaves whenever it lifts, which would end every preview a tap starts.
        if (hovers(nativeEvent.pointerType)) onLeave();
      }}
      // Only the web has keyboard focus here.
      onFocus={
        web
          ? () => {
              pressed.current = false;
            }
          : undefined
      }
      onBlur={web ? blur : undefined}
    >
      {children}
    </Stack>
  );
}
