/**
 * The web's motion engine: a list measures its items before React changes the
 * screen and glides each from where it was (`reorder.ts`), animating the DOM
 * elements React Native Web renders (`dom.ts`).
 */
import { useMemo } from 'react';
import { View } from 'react-native';

import { measure, type Positions, reorder } from './reorder';
import type { Spring } from './spring';
import type { HostProps, ListMotion } from './types';

/** A plain view: the engine animates its DOM element */
export function MotionHost({ join, list: _list, animating: _arriving, ...rest }: HostProps) {
  return <View {...rest} ref={join as never} />;
}

export function useListMotion(spring: Spring): ListMotion {
  return useMemo(
    () => ({
      before: measure,
      after: (before, items) => reorder(before as Positions, items, spring),
    }),
    [spring],
  );
}
