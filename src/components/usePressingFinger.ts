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
 * Tracks the finger that pressed a control, by its touch identifier and where
 * it went down, so other fingers on the screen can't move, lift or cancel
 * the press. Pass `down` as the control's `onTouchStart`, and call `moved`,
 * `lift` and `cancel` from its other touch handlers.
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
      const stillPressing = from && !touchOf(changedTouches, from.id) && touchOf(touches, from.id);
      if (stillPressing) return;
      const [touch] = changedTouches;
      start.current = touch && { id: touch.identifier, x: touch.pageX, y: touch.pageY };
    },
    /** How far the pressing finger has moved, if `event` is its move. */
    moved(event: GestureResponderEvent) {
      return start.current && movedBy(event, start.current);
    },
    /** Ends the press if `event` is the pressing finger's lift, with how far it moved. */
    lift(event: GestureResponderEvent) {
      const offset = start.current && movedBy(event, start.current);
      if (offset) start.current = undefined;
      return offset;
    },
    /**
     * Ends the press, and returns true, unless `event` is another finger's
     * cancel: one that doesn't list the pressing finger (a whole gesture's
     * cancel lists every finger). With no press, there is nothing to keep.
     */
    cancel(event: GestureResponderEvent) {
      const from = start.current;
      if (from && !touchOf(event.nativeEvent.changedTouches, from.id)) return false;
      start.current = undefined;
      return true;
    },
  };
}
