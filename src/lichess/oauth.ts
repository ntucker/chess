import { BASE_PATH } from '@/files/basePath';

/** lichess's site, where it signs in and answers about accounts. */
export const LICHESS = 'https://lichess.org';

/**
 * The name the app gives lichess when signing in. lichess needs no
 * registration for an app without a server (OAuth with PKCE); it shows this
 * name on its sign-in page.
 */
export const LICHESS_CLIENT_ID = 'opening-night';

/**
 * lichess's sign-in page (`AuthSession.DiscoveryDocument`). The code is
 * traded for a token by `signInLichess`, which also reads the account.
 */
export const LICHESS_DISCOVERY = { authorizationEndpoint: `${LICHESS}/oauth` };

/**
 * Where lichess sends the learner back after signing in: the app's
 * `/lichess` route. On the web that is this build's own page (a pull
 * request's preview has its own), which hands the answer to the page that
 * opened it. On the phone it is the app's address scheme (app.json), its
 * package name, since lichess refuses a scheme that isn't a reverse domain.
 * The router leaves the screen as it is when the phone's answer arrives
 * (`isLichessReturn`, src/app/+native-intent.tsx).
 */
export const lichessRedirectUri = () =>
  process.env.EXPO_OS === 'web' ? `${window.location.origin}${BASE_PATH}/lichess` : PHONE_RETURN;

const PHONE_RETURN = 'io.github.ntucker.openingnight://lichess';

/**
 * Whether `url` leads to the `/lichess` route: lichess's answer to a sign-in
 * on the phone (`lichessRedirectUri`). The router hands its address on in
 * whole (as on the emulator) or as a path, so either form counts.
 */
export const isLichessReturn = (url: string) =>
  /^(?:io\.github\.ntucker\.openingnight:\/\/|\/)lichess\/?(?:[?#]|$)/.test(url);
