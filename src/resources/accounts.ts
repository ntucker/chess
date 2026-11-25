import { Endpoint, Entity } from '@data-client/rest';

import {
  type Accounts,
  accountsText,
  type LichessAccount,
  parseAccounts,
} from '@/accounts/accounts';
import { readStorage, storageKey, writeStorage } from '@/context/storage';
import { LICHESS, LICHESS_CLIENT_ID } from '@/lichess/oauth';

import { StorageSync } from './storageSync';

/** Where the accounts are saved (`accountsText`). */
const KEY = storageKey('accounts');

/** The accounts the device keeps (src/accounts/accounts.ts): one record, whatever is signed in. */
export class SavedAccounts extends Entity {
  readonly lichess: LichessAccount | undefined = undefined;

  pk() {
    return 'device';
  }

  static key = 'SavedAccounts';
}

const saved = (): Accounts => parseAccounts(readStorage(KEY) ?? '');

// Every field present, an absent account as undefined, so the store's copy
// loses an account the save no longer has.
const record = ({ lichess }: Accounts) => ({ lichess });

const save = (accounts: Accounts) => {
  writeStorage(KEY, accountsText(accounts));
  return record(accounts);
};

/**
 * The learner's accounts, read from the device. They change only by signing
 * in or out (`signInLichess`, `signOutLichess`), or by another tab doing so
 * (`AccountsSync`).
 *
 * ```ts
 * const { lichess } = useSuspense(getAccounts);
 * ```
 */
export const getAccounts = new Endpoint(async () => record(saved()), {
  schema: SavedAccounts,
  name: 'getAccounts',
  dataExpiryLength: Infinity,
});

/** What lichess's sign-in page answered: the code to trade for a token, and the PKCE proof. */
export interface LichessGrant {
  readonly code: string;
  readonly codeVerifier: string;
  readonly redirectUri: string;
}

/**
 * Trades a sign-in's code for a token (OAuth with PKCE, which needs no
 * server), reads the account's name with it, and saves both on the device.
 *
 * ```ts
 * await ctrl.fetch(signInLichess, { code, codeVerifier, redirectUri });
 * ```
 */
export const signInLichess = new Endpoint(
  async ({ code, codeVerifier, redirectUri }: LichessGrant) => {
    const granted = await lichessJson<{ access_token: string }>('/api/token', {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        code_verifier: codeVerifier,
        redirect_uri: redirectUri,
        client_id: LICHESS_CLIENT_ID,
      }),
    });
    const token = granted.access_token;
    const { username } = await lichessJson<{ username: string }>('/api/account', {
      headers: { Authorization: `Bearer ${token}` },
    });
    return save({ ...saved(), lichess: { username, token } });
  },
  { schema: SavedAccounts, sideEffect: true, name: 'signInLichess' },
);

/**
 * Forgets the lichess account on the device, and asks lichess to revoke its
 * token. Signing out works offline too: then the token stays valid on
 * lichess until it expires, but the device no longer has it.
 *
 * ```ts
 * await ctrl.fetch(signOutLichess);
 * ```
 */
export const signOutLichess = new Endpoint(
  async () => {
    const { lichess, ...rest } = saved();
    const after = save(rest);
    if (lichess) {
      await fetch(`${LICHESS}/api/token`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${lichess.token}` },
      }).catch(() => undefined);
    }
    return after;
  },
  { schema: SavedAccounts, sideEffect: true, name: 'signOutLichess' },
);

/** The lichess token saved on the device, if the learner signed in. */
export const lichessToken = () => saved().lichess?.token;

/** Takes in another tab signing in or out (`StorageSync`). */
export class AccountsSync extends StorageSync {
  constructor() {
    super(KEY, (controller) => controller.setResponse(getAccounts, record(saved())));
  }
}

async function lichessJson<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${LICHESS}${path}`, init);
  if (!response.ok) throw new Error(`lichess answered ${response.status} for ${path}`);
  return (await response.json()) as T;
}
