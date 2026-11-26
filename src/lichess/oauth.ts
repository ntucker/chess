import { parseStoredObject, readStorage, storageKey, writeStorage } from '@/context/storage';
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
 * request's preview has its own), which finishes the sign-in in the popup
 * (`takePendingSignIn`). On the phone it is the app's address scheme (app.json), its
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

/** A web sign-in waiting for lichess's answer: what the popup needs to trade the code for a token. */
export interface PendingSignIn {
  /** The OAuth `state` the sign-in page was opened with, which lichess's answer repeats. */
  readonly state: string;
  readonly codeVerifier: string;
  readonly redirectUri: string;
}

/**
 * Where the web keeps a sign-in waiting for lichess's answer. lichess's pages
 * cut the popup off from the page that opened it (they send
 * `Cross-Origin-Opener-Policy: same-origin`), so the opener never hears the
 * answer: the popup's `/lichess` page finishes the sign-in itself, and the
 * page that opened it takes in the saved account as it does another tab's.
 */
const PENDING = storageKey('lichess-sign-in');

/** Keeps `pending` for the popup's `/lichess` page, in place of any earlier sign-in. */
export const savePendingSignIn = (pending: PendingSignIn) =>
  writeStorage(PENDING, JSON.stringify(pending));

/** The saved sign-in's fields, unchecked: an empty object where nothing waits. */
const readPendingSignIn = () => parseStoredObject(readStorage(PENDING) ?? '');

/** Whether a web sign-in waits for lichess's answer, whatever its state. */
export const isSignInPending = () => typeof readPendingSignIn().state === 'string';

/**
 * The sign-in waiting for the answer that repeats `state`, forgotten once
 * taken, so a code is traded once. None where no sign-in waits or another one
 * does: an answer whose state doesn't match is refused (OAuth's guard against
 * an answer the learner didn't ask for). A popup closed before lichess
 * answered leaves its sign-in until the next one replaces it; its verifier is
 * of no use without lichess's one-time code.
 */
export function takePendingSignIn(state: string): PendingSignIn | undefined {
  const pending = readPendingSignIn();
  if (pending.state !== state) return undefined;
  // Forgotten: the storage module has no removal, and empty text reads as nothing waiting.
  writeStorage(PENDING, '');
  return typeof pending.codeVerifier === 'string' && typeof pending.redirectUri === 'string'
    ? { state, codeVerifier: pending.codeVerifier, redirectUri: pending.redirectUri }
    : undefined;
}
