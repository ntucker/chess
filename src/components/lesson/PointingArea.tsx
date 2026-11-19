import { Stack } from '@reactive/silk-native';
import { type FocusEvent as ReactFocusEvent, type ReactNode, useRef } from 'react';

import { hovers } from '@/board/pointer';

interface Props {
  /** The pointer, or the keyboard focus, left the area. */
  readonly onLeave: () => void;
  readonly children: ReactNode;
}

/** How soon after a finger lifts its tap moves focus. */
const LIFT_FOCUS_MS = 300;

/**
 * The part of the panel the learner points into: what is pointed at inside
 * stays pointed at until the mouse leaves the area, or keyboard focus moves
 * out of it. Touch screens have neither, so on them it is only a stack.
 */
export function PointingArea({ onLeave, children }: Props) {
  // A press inside the area: whether the pointer is down, and when a finger
  // last lifted. Its focus change comes while it is down, or for a finger
  // just after it lifts. Focus a press moves to nowhere came from a tap or
  // click on something that takes no focus, such as a note's words, which
  // the pointer handles, not the keyboard.
  const press = useRef({ down: false, upAt: -Infinity });
  const endPress = ({ nativeEvent }: { nativeEvent: { pointerType: string } }) => {
    const finger = !hovers(nativeEvent.pointerType);
    press.current = { down: false, upAt: finger ? performance.now() : press.current.upAt };
  };
  // The DOM's own focus events, which bubble from the buttons inside: focus
  // that moves to another of them stays in, and so does focus a press inside
  // moves to nowhere. Any other blur leaves: Tab past the last button, a tap
  // outside, or another window.
  const blur = (event: unknown) => {
    const { currentTarget, relatedTarget } = event as ReactFocusEvent<HTMLElement>;
    const { down, upAt } = press.current;
    const stays =
      relatedTarget instanceof Node
        ? currentTarget.contains(relatedTarget)
        : down || performance.now() - upAt < LIFT_FOCUS_MS;
    if (!stays) onLeave();
  };
  return (
    <Stack
      gap="5"
      onPointerDown={() => {
        press.current = { ...press.current, down: true };
      }}
      onPointerUp={endPress}
      onPointerCancel={endPress}
      onPointerLeave={(event) => {
        // A press released outside never comes up here, so it ends as it
        // leaves. A pointer leaving with nothing pressed has no press to end.
        if (press.current.down) endPress(event);
        // A finger leaves whenever it lifts, which would end every preview a tap starts.
        if (hovers(event.nativeEvent.pointerType)) onLeave();
      }}
      // Only the web has keyboard focus here.
      onBlur={process.env.EXPO_OS === 'web' ? blur : undefined}
    >
      {children}
    </Stack>
  );
}
