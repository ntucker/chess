import { Redirect } from 'expo-router';
import { maybeCompleteAuthSession } from 'expo-web-browser';

// On the web this page opens in the sign-in popup. Handing lichess's answer
// to the page that opened it at once, before the app's layout renders, lets
// the popup close sooner. On the phone and in the static export (no window)
// it hands nothing on.
const handedOn = maybeCompleteAuthSession().type === 'success';

/**
 * Where lichess sends the learner back after signing in (`lichessRedirectUri`).
 * In the web popup the answer is handed on (above) and the popup closes.
 * Reached any other way (on the phone only when the app had to start for the
 * answer, src/app/+native-intent.tsx; on the web by its address), there is
 * nothing to finish, so it goes home.
 */
export default function LichessReturnRoute() {
  return handedOn ? null : <Redirect href="/" />;
}
