import type { ComponentType, ReactNode } from 'react';
import type { ViewProps } from 'react-native';

/**
 * A list whose items glide (on `springs.brisk`) to wherever a change moves
 * them. It renders no element of its own and knows nothing of the layout,
 * so it fits any list.
 */
export interface MotionListProps {
  /**
   * The change whose new items fade in (and, on the web, whose removed items
   * fade out): the list, or what decides it. Items mounting or unmounting on
   * any other change appear and go at once, so a list rebuilt for a new
   * subject doesn't flicker.
   */
  readonly layoutDependency: unknown;
  readonly children: ReactNode;
}

/** Names an item across renders: its row's id */
export type Key = string | number;

/**
 * A view that moves instead of jumping: inside a `MotionList`, the item
 * named `id` (the web follows it by `id` even when React remounts it
 * elsewhere; Android follows the view itself). Use it like a `View`; the
 * motion owns its translate and opacity.
 */
export interface MotionViewProps extends Omit<ViewProps, 'id'> {
  readonly id: Key;
}

/**
 * A platform's motion engine (`MotionList.tsx` for native, which is
 * Android, and `MotionList.web.tsx`). TypeScript resolves `./MotionList` to the Android
 * file alone, so `engine.contract.ts` holds both to this.
 */
export interface Engine {
  readonly MotionList: ComponentType<MotionListProps>;
  readonly MotionView: ComponentType<MotionViewProps>;
}
