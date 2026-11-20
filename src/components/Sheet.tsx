import { Surface, Text, useTheme } from '@reactive/silk-native';
import type { ReactNode } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';

import { HeaderButton } from '@/components/HeaderButton';
import { fonts, scrim } from '@/theme/theme';

interface Props {
  /** The sheet's name, at its top and for screen readers. */
  readonly title: string;
  readonly visible: boolean;
  /** The close button, a tap beside the sheet, Escape or Android's back button. */
  readonly onClose: () => void;
  readonly children: ReactNode;
}

/**
 * A sheet that rises from the bottom of the screen over a veiled page, for
 * what a small screen has no room to keep in view, such as settings. Its
 * content scrolls once taller than the screen allows. React Native's Modal,
 * so it traps focus on the web and works the same on Android.
 */
export function Sheet({ title, visible, onClose, children }: Props) {
  const { theme } = useTheme();
  const { radius } = theme.semantic;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.veil, { backgroundColor: scrim[theme.colorScheme] }]}>
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
          <View style={styles.head}>
            <Text role="heading" accessibilityRole="header" style={styles.title}>
              {title}
            </Text>
            <HeaderButton
              icon="close"
              iconSize={22}
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
            />
          </View>
          <ScrollView contentContainerStyle={styles.content}>{children}</ScrollView>
        </Surface>
      </View>
    </Modal>
  );
}

/** Space inside the sheet. */
const INSET = 20;

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
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: INSET - 6,
    paddingHorizontal: INSET,
    paddingRight: INSET - 8,
  },
  title: { fontFamily: fonts.display, fontSize: 24 },
  content: { padding: INSET, paddingTop: 12 },
});
