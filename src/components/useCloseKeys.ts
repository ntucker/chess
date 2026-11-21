import { useIsFocused } from 'expo-router';
import { useEffect, useEffectEvent } from 'react';
import { BackHandler } from 'react-native';

import { useScreenKeys } from '@/components/useScreenKeys';

/**
 * Closes a panel open in the page the way a dialog closes, while this screen
 * is in front: Escape on the web, and Android's back button or gesture,
 * which then closes the panel instead of leaving the screen. A dialog or
 * pop-up over the page takes them first.
 */
export function useCloseKeys(onClose: () => void) {
  useScreenKeys((event) => {
    if (event.key === 'Escape') onClose();
  });
  const focused = useIsFocused();
  const close = useEffectEvent(onClose);
  useEffect(() => {
    if (!focused) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => subscription.remove();
  }, [focused]);
}
