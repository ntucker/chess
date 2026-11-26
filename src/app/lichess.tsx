import { Redirect } from 'expo-router';
import { maybeCompleteAuthSession } from 'expo-web-browser';

// On the web this page opens in the sign-in popup. Handing lichess's answer
// to the page that opened it at once, before the app's layout renders, lets
// the popup close sooner; on the phone and in the static export (no window)
// it does nothing.
maybeCompleteAuthSession();

/**
 * Where lichess sends the learner back after signing in (`lichessRedirectUri`).
 * On the web the popup closes once its answer is handed on (above). On the
 * phone the router reaches this page only when the app had to start for the
 * answer (src/app/+native-intent.tsx), with nothing to step back to, so it
 * goes home.
 */
export default function LichessReturnRoute() {
  return process.env.EXPO_OS === 'web' ? null : <Redirect href="/" />;
}
