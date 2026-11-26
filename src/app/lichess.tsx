import { router } from 'expo-router';
import { maybeCompleteAuthSession } from 'expo-web-browser';
import { useEffect } from 'react';

// On the web this page opens in the sign-in popup. Handing lichess's answer
// to the page that opened it at once, before the app's layout renders, lets
// the popup close sooner; on the phone and in the static export (no window)
// it does nothing.
maybeCompleteAuthSession();

/**
 * Where lichess sends the learner back after signing in (`lichessRedirectUri`).
 * On the web the popup closes once its answer is handed on (above). On the
 * phone the sign-in already has its answer, so this page steps back to where
 * the learner was.
 */
export default function LichessReturnRoute() {
  useEffect(() => {
    if (process.env.EXPO_OS === 'web') return;
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, []);
  return null;
}
