import { Pressable } from '@reactive/silk-native';
import {
  type ComponentRef,
  type ReactNode,
  type RefObject,
  useLayoutEffect,
  useState,
} from 'react';
import { Modal, StyleSheet, useWindowDimensions, View } from 'react-native';

import { type Box, placePopup, type Size } from './popupPlace';

export interface PopupProps {
  /** What it opens from: it sits just below it, or above it if there's more room there. */
  readonly anchor: RefObject<ComponentRef<typeof View> | null>;
  /** Closes it: a press anywhere else, or the back button. */
  readonly onDismiss: () => void;
  /** The pointer came onto it (web only). */
  readonly onHoverIn?: () => void;
  /** The pointer left it (web only). */
  readonly onHoverOut?: () => void;
  readonly children: ReactNode;
}

/**
 * A surface floating over the page beside `anchor`, such as a menu, while it
 * is rendered. On native it is a transparent modal: a press outside it closes
 * it, as does the back button. (`Popup.web.tsx` is the web's.)
 */
export function Popup({ anchor, onDismiss, children }: PopupProps) {
  const screen = useWindowDimensions();
  const [anchorBox, setAnchorBox] = useState<Box>();
  const [size, setSize] = useState<Size>();
  useLayoutEffect(() => {
    anchor.current?.measureInWindow((x, y, width, height) => setAnchorBox({ x, y, width, height }));
  }, [anchor]);
  const place = anchorBox && size && placePopup(anchorBox, size, screen);
  return (
    <Modal transparent statusBarTranslucent visible onRequestClose={onDismiss}>
      <Pressable
        accessibilityLabel="Close"
        accessibilityRole="button"
        focusRing={false}
        onPress={onDismiss}
        style={StyleSheet.absoluteFill}
      />
      <View
        // Measured once, before it is placed; a smaller maxHeight later doesn't move it.
        onLayout={({ nativeEvent: { layout } }) => setSize((measured) => measured ?? layout)}
        style={[
          styles.popup,
          place ? { left: place.left, top: place.top, maxHeight: place.maxHeight } : styles.hidden,
        ]}
      >
        {children}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  popup: { position: 'absolute' },
  hidden: { opacity: 0 },
});
