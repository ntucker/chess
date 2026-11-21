import { Dialog, Inline } from '@reactive/silk-native';
import { useIsFocused } from 'expo-router';
import { type ReactNode, useEffect, useEffectEvent } from 'react';
import { ScrollView } from 'react-native';

import { HEADER_BUTTON_SIZE, HeaderButton } from '@/components/HeaderButton';
import { narrowStyles } from '@/theme/narrow';
import { useNarrowStyles } from '@/theme/Narrow';
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
 * Silk's bottom Dialog, so it traps focus on the web and works the same on
 * Android.
 */
export function Sheet({ title, onClose, children }: Props) {
  // A screen left underneath stays mounted, and the dialog would cover the one on top.
  const focused = useIsFocused();
  const close = useEffectEvent(onClose);
  const styles = useNarrowStyles(STYLES);
  useEffect(() => {
    if (!focused) close();
  }, [focused]);
  return (
    <Dialog.Root open onOpenChange={onClose}>
      <Dialog.Content placement="bottom" testID="sheet" style={styles.sheet}>
        <Inline align="center" justify="between" wrap="nowrap" style={styles.head}>
          <Dialog.Title>{title}</Dialog.Title>
          <HeaderButton
            icon="close"
            iconSize={CLOSE_ICON}
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
          />
        </Inline>
        <ScrollView contentContainerStyle={styles.content}>{children}</ScrollView>
      </Dialog.Content>
    </Dialog.Root>
  );
}

/** Space inside the sheet: Silk's step 5. */
const INSET = themes.dark.semantic.space[5];
/** Space between the sheet's head and what it holds: Silk's step 3. */
const HEAD_GAP = themes.dark.semantic.space[3];
const CLOSE_ICON = 22;
/**
 * The head's inset above and beside the close button: INSET less the
 * button's own padding around its icon, so the icon lines up with the content.
 */
const AROUND_BUTTON = HEADER_BUTTON_SIZE.minus(CLOSE_ICON).times(-0.5).plus(INSET);

const STYLES = narrowStyles((px) => ({
  head: { paddingTop: px(AROUND_BUTTON), paddingLeft: INSET, paddingRight: px(AROUND_BUTTON) },
  // The head and the scrolling content keep their own insets, so the content scrolls edge to edge.
  sheet: { maxWidth: 560, padding: 0 },
  content: { padding: INSET, paddingTop: HEAD_GAP },
}));
