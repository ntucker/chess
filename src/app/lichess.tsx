import { Redirect } from 'expo-router';

import { BrowserOnly } from '@/components/BrowserOnly';
import { LichessReturn } from '@/components/LichessReturn';

/**
 * Where lichess sends the learner back after signing in (`lichessRedirectUri`).
 * On the web this page opens in the sign-in popup, which finishes the sign-in
 * (`LichessReturn`; the export has no address to read, so it waits for the
 * browser). On the phone it is reached only when the app had to start for
 * the answer (src/app/+native-intent.tsx), with nothing to finish, so it goes
 * home.
 */
export default function LichessReturnRoute() {
  if (process.env.EXPO_OS !== 'web') return <Redirect href="/" />;
  return (
    <BrowserOnly fallback={null}>
      <LichessReturn />
    </BrowserOnly>
  );
}
