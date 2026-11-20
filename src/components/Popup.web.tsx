import { type ComponentRef, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { type PointerEvent as ViewPointerEvent, View, type ViewStyle } from 'react-native';

import type { PopupProps } from './Popup';
import { type PopupPlace, placePopup } from './popupPlace';

/**
 * The web's Popup (see `Popup.tsx`): drawn in a portal at the end of the page,
 * so no box around the anchor clips it or paints over it. A press outside it
 * and its anchor closes it, as do Escape, scrolling the page and resizing the
 * window. Closing it while it holds focus hands focus back to the anchor.
 */
export function Popup({ anchor, onDismiss, onHoverIn, onHoverOut, children }: PopupProps) {
  const popup = useRef<ComponentRef<typeof View>>(null);
  const [place, setPlace] = useState<PopupPlace>();

  useLayoutEffect(() => {
    const from = element(anchor.current);
    const self = element(popup.current);
    if (!from || !self) return;
    const { left, top, width, height } = from.getBoundingClientRect();
    const size = self.getBoundingClientRect();
    setPlace(
      placePopup({ x: left, y: top, width, height }, size, {
        width: document.documentElement.clientWidth,
        height: window.innerHeight,
      }),
    );
    return () => {
      // Runs before the popup leaves the page, so focus inside it is still there to see.
      if (self.contains(document.activeElement)) from.focus();
    };
  }, [anchor]);

  useEffect(() => {
    const inside = (target: EventTarget | null) =>
      target instanceof Node &&
      [anchor.current, popup.current].some((node) => element(node)?.contains(target));
    const onPointerDown = (event: PointerEvent) => {
      if (!inside(event.target)) onDismiss();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onDismiss();
    };
    const onScroll = (event: Event) => {
      if (!inside(event.target)) onDismiss();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onDismiss);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onDismiss);
    };
  }, [anchor, onDismiss]);

  return createPortal(
    <View
      ref={popup}
      onPointerEnter={mouseOnly(onHoverIn)}
      onPointerLeave={mouseOnly(onHoverOut)}
      style={[
        styles.popup,
        // Measured where it can grow to its full height, unseen but focusable, then placed.
        place ? { left: place.left, top: place.top, maxHeight: place.maxHeight } : styles.hidden,
      ]}
    >
      {children}
    </View>,
    document.body,
  );
}

/** `handler`, called only for a pointer that can hover: a touch's pointer leaves as it lifts. */
const mouseOnly =
  (handler: (() => void) | undefined) =>
  ({ nativeEvent }: ViewPointerEvent) => {
    if (nativeEvent.pointerType !== 'touch') handler?.();
  };

/** React Native Web's View refs are the DOM elements themselves. */
const element = (view: ComponentRef<typeof View> | null) => view as unknown as HTMLElement | null;

// React Native's types lack the web's `fixed`; React Native Web takes it.
const styles = {
  // Above everything the page draws, the board's pieces included.
  popup: { position: 'fixed', zIndex: 1000 },
  hidden: { left: 0, top: 0, opacity: 0, pointerEvents: 'none' },
} as unknown as Record<'popup' | 'hidden', ViewStyle>;
