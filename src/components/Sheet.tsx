import { Inline, Surface, Text, useTheme } from '@reactive/silk-native';
import { useIsFocused } from 'expo-router';
import { type ReactNode, useEffect, useEffectEvent } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';

import { HEADER_BUTTON_SIZE, HeaderButton } from '@/components/HeaderButton';
import { themes } from '@/theme/theme';

interface Props {
  /** The sheet's name, at its top and for screen readers. */
  readonly title: string;
  /**
   * The close button, a tap beside the sheet, Escape, Android's back button,
   * or another screen coming on top of this one.
   */
  readonly onClose: () => void;
  readonly children: ReactNode;
}

/**
 * A sheet that rises from the bottom of the screen over a veiled page, for
 * what a small screen has no room to keep in view, such as settings. Shown
 * while mounted. Its content scrolls once taller than the screen allows.
 * React Native's Modal, so it traps focus on the web and works the same on
 * Android.
 */
export function Sheet({ title, onClose, children }: Props) {
  const { theme } = useTheme();
  const { color, radius } = theme.semantic;
  // A screen left underneath stays mounted, and the Modal would cover the one on top.
  const focused = useIsFocused();
  const close = useEffectEvent(onClose);
  useEffect(() => {
    if (!focused) close();
  }, [focused]);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.veil, { backgroundColor: color.overlay }]}>
        {/* A tap beside the sheet closes it: not a button, since the close button is the one to reach. */}
        <View
          style={StyleSheet.absoluteFill}
          onStartShouldSetResponder={() => true}
          onResponderRelease={onClose}
        />
        <Surface
          elevation="overlay"
          border="subtle"
          aria-label={title}
          style={[
            styles.sheet,
            { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
          ]}
        >
          <Inline align="center" justify="between" wrap="nowrap" style={styles.head}>
            <Text role="heading" accessibilityRole="header">
              {title}
            </Text>
            <HeaderButton
              icon="close"
              iconSize={CLOSE_ICON}
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
            />
          </Inline>
          <ScrollView contentContainerStyle={styles.content}>{children}</ScrollView>
        </Surface>
      </View>
    </Modal>
  );
}

/** Space inside the sheet, and between its head and what it holds: Silk's steps 5 and 3. */
const { 3: HEAD_GAP, 5: INSET } = themes.dark.semantic.space;
const CLOSE_ICON = 22;
/** The close button's padding around its icon, which the head's inset includes. */
const BUTTON_PADDING = HEADER_BUTTON_SIZE.minus(CLOSE_ICON).times(0.5);
const BESIDE_BUTTON = BUTTON_PADDING.times(-1).plus(INSET).value;

const styles = StyleSheet.create({
  veil: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  sheet: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '88%',
    borderBottomWidth: 0,
    overflow: 'hidden',
    // Over the veil, which is positioned and so would cover it.
    zIndex: 1,
  },
  head: { paddingTop: BESIDE_BUTTON, paddingLeft: INSET, paddingRight: BESIDE_BUTTON },
  content: { padding: INSET, paddingTop: HEAD_GAP },
});
