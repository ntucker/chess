import { useRef } from 'react';
import type { GestureResponderEvent } from 'react-native';

import type { Point } from '@/motion/dom';

/** A finger: which one, and where it went down. */
interface Finger extends Point {
  readonly id: number;
}

type Touches = GestureResponderEvent['nativeEvent']['touches'];

/** Finger `id`'s touch in `touches`, if it's there. */
const touchOf = (touches: Touches, id: number) =>
  [...touches].find((touch) => touch.identifier === id);

/** How far finger `from` has moved, if `event` is about it (it moved, lifted or was cancelled). */
function movedBy({ nativeEvent }: GestureResponderEvent, from: Finger): Point | undefined {
  const touch = touchOf(nativeEvent.changedTouches, from.id);
  return touch && { x: touch.pageX - from.x, y: touch.pageY - from.y };
}

/**
 * The finger pressing a control, followed by its touch identifier from where
 * it went down, so other fingers on the screen can't move, lift or cancel
 * it. Pass `down` as the control's `onTouchStart`; the others read the
 * matching touch events.
 */
export function usePressingFinger() {
  const start = useRef<Finger>(undefined);
  return {
    /**
     * The first finger down is the press: React Native gives the control's
     * touch to it. Once that finger is gone from the screen, or its
     * identifier comes back on a new finger (Android reuses them), the next
     * finger down starts over, so a lost lift can't stick.
     */
    down(event: GestureResponderEvent) {
      const { touches, changedTouches } = event.nativeEvent;
      const from = start.current;
      if (from && !touchOf(changedTouches, from.id) && touchOf(touches, from.id)) return;
      const [touch] = changedTouches;
      start.current = touch && { id: touch.identifier, x: touch.pageX, y: touch.pageY };
    },
    /** How far the pressing finger has moved, if `event` is its move. */
    moved(event: GestureResponderEvent) {
      return start.current && movedBy(event, start.current);
    },
    /** How far the pressing finger moved before lifting, if `event` is its lift; the press ends. */
    lifted(event: GestureResponderEvent) {
      const offset = start.current && movedBy(event, start.current);
      if (offset) start.current = undefined;
      return offset;
    },
    /**
     * Whether `event` cancels the press, which ends it: a cancel that doesn't
     * list the pressing finger is another finger's, while a whole gesture's
     * cancel lists every finger.
     */
    cancelled(event: GestureResponderEvent) {
      const from = start.current;
      if (from && !touchOf(event.nativeEvent.changedTouches, from.id)) return false;
      start.current = undefined;
      return true;
    },
  };
}
