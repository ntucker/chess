import type { ComponentType, ReactNode } from 'react';
import type { ViewProps } from 'react-native';

import type { Spring } from './spring';

/**
 * A list whose items glide to wherever a change moves them, fading in the
 * ones that arrive (and out the ones that leave, on the web). It renders no
 * element of its own and knows nothing of the layout, so it fits any list.
 *
 * Put it where the list is read and pass the list (or what decides it) as
 * `layoutDependency`: it must re-render with the change it animates.
 */
export interface MotionListProps {
  /** The change to animate: items arrive (and, on the web, move) only when this changes */
  readonly layoutDependency: unknown;
  readonly spring?: Spring;
  readonly children: ReactNode;
}

/** Names an item across renders (its row's id), so it is followed even when React remounts it */
export type Key = string | number;

/**
 * A view that moves instead of jumping: inside a `MotionList`, the item
 * named `id`. Use it like a `View`; the motion owns its translate and opacity.
 */
export interface MotionViewProps extends Omit<ViewProps, 'id'> {
  readonly id: Key;
}

/**
 * A platform's motion engine (`MotionList.tsx` for Android,
 * `MotionList.web.tsx`). TypeScript resolves `./MotionList` to the Android
 * file alone, so `engine.contract.ts` holds both to this.
 */
export interface Engine {
  readonly MotionList: ComponentType<MotionListProps>;
  readonly MotionView: ComponentType<MotionViewProps>;
}
