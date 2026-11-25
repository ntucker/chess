import { router } from 'expo-router';
import { maybeCompleteAuthSession } from 'expo-web-browser';
import { useEffect } from 'react';

/**
 * Where lichess sends the learner back after signing in (`lichessRedirectUri`).
 * On the web this page opens in the sign-in popup: it hands lichess's answer
 * to the page that opened it, which closes the popup. On the phone the
 * sign-in already has its answer, so this page steps back to where the
 * learner was.
 */
export default function LichessReturnRoute() {
  useEffect(() => {
    if (process.env.EXPO_OS === 'web') maybeCompleteAuthSession();
    else if (router.canGoBack()) router.back();
    else router.replace('/');
  }, []);
  return null;
}
