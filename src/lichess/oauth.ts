import { BASE_PATH } from '@/files/basePath';

/** lichess's site, where it signs in and answers about accounts. */
export const LICHESS = 'https://lichess.org';

/**
 * The name the app gives lichess when signing in. lichess needs no
 * registration for an app without a server (OAuth with PKCE); it shows this
 * name on its sign-in page.
 */
export const LICHESS_CLIENT_ID = 'opening-night';

/** lichess's OAuth pages (`AuthSession.DiscoveryDocument`). */
export const LICHESS_DISCOVERY = {
  authorizationEndpoint: `${LICHESS}/oauth`,
  tokenEndpoint: `${LICHESS}/api/token`,
};

/**
 * Where lichess sends the learner back after signing in: the app's
 * `/lichess` route. On the web that is this build's own page (a pull
 * request's preview has its own), which hands the answer to the page that
 * opened it; on the phone, the app's address scheme.
 */
export const lichessRedirectUri = () =>
  process.env.EXPO_OS === 'web'
    ? `${window.location.origin}${BASE_PATH}/lichess`
    : 'openingnight://lichess';
