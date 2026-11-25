// The learner's accounts on other sites, as the device keeps them
// (src/resources/accounts.ts). Only lichess so far: signing in lets the app
// ask lichess's opening explorer, which refuses requests without a token.

import { isObject, parseStoredObject } from '@/context/storage';

/** A lichess account the learner signed in to. */
export interface LichessAccount {
  readonly username: string;
  /** The OAuth token the sign-in gave, with no scopes: enough for the explorer. */
  readonly token: string;
}

export interface Accounts {
  readonly lichess?: LichessAccount;
}

/** The shape `accountsText` writes; a save in another version reads as no accounts. */
const VERSION = 1;

/** `accounts` as the text the device keeps. */
export const accountsText = (accounts: Accounts) =>
  JSON.stringify({ version: VERSION, ...accounts });

/**
 * The accounts saved as `text` (`accountsText`). A save in another version,
 * or an account missing a field, reads as no account, so the learner signs
 * in again rather than the app sending a damaged token.
 */
export function parseAccounts(text: string): Accounts {
  const saved = parseStoredObject(text);
  if (saved.version !== VERSION) return {};
  const { lichess } = saved;
  return isObject(lichess) &&
    typeof lichess.username === 'string' &&
    typeof lichess.token === 'string'
    ? { lichess: { username: lichess.username, token: lichess.token } }
    : {};
}
