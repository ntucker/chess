import { isLichessReturn } from '@/lichess/oauth';

/**
 * Where the router goes for an address the phone opens the app with. lichess's
 * answer to a sign-in belongs to the sign-in that is waiting for it
 * (`useLichessSignIn`), so while the app runs the router stays where the
 * learner is, with the settings sheet still open. If the app had to start
 * for it, the `/lichess` route sends the learner home.
 */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  return !initial && isLichessReturn(path) ? null : path;
}
