import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { Controller, NetworkManager } from '@data-client/react';
import { initialState, prepareStore } from '@data-client/react/redux';

import { lineKeys } from '@/lesson/select';

import {
  AccountsSync,
  getAccounts,
  LichessRefusals,
  signInLichess,
  signOutLichess,
} from './accounts';
import { getExplorerCounts } from './explorer';

/** After 1.e4 e5 2.Nf3 Nc6 3.Bc4 Nf6, where White may castle. */
const CASTLES = lineKeys(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6']).at(-1)!;
const GRANT = { code: 'code', codeVerifier: 'verifier', redirectUri: 'openingnight://lichess' };
const saved = () => JSON.parse(localStorage.getItem('accounts') ?? 'null');

/** lichess as the app asks it: each call recorded, answered by `answers` in turn. */
let calls: { url: string; init?: RequestInit }[] = [];
let answers: (() => Promise<Response>)[] = [];
const json = (body: object) => async () =>
  ({ ok: true, status: 200, json: async () => body }) as Response;

const syncs: AccountsSync[] = [];
function newStore() {
  const sync = new AccountsSync();
  syncs.push(sync);
  const { controller } = prepareStore(
    initialState,
    () => [sync, new LichessRefusals(), new NetworkManager()],
    Controller,
  );
  sync.init();
  // The store takes in an answer a moment after the fetch resolves.
  const shown = async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    return controller.getResponse(getAccounts, controller.getState()).data;
  };
  return { controller, shown };
}

beforeEach(() => {
  localStorage.clear();
  calls = [];
  answers = [];
  // The test page has no fetch of its own.
  globalThis.fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return answers.shift()!();
  };
});
afterEach(() => syncs.splice(0).forEach((sync) => sync.cleanup()));

describe('lichess account on the device', () => {
  it('trades the sign-in code for a token, names the account with it, and keeps both', async () => {
    answers = [json({ access_token: 'lip_token' }), json({ username: 'learner' })];
    const { controller, shown } = newStore();
    await controller.fetch(getAccounts);
    await controller.fetch(signInLichess, GRANT);

    const [trade, account] = calls;
    expect(trade.url).toBe('https://lichess.org/api/token');
    expect(Object.fromEntries(trade.init!.body as URLSearchParams)).toEqual({
      grant_type: 'authorization_code',
      code: 'code',
      code_verifier: 'verifier',
      redirect_uri: 'openingnight://lichess',
      client_id: 'opening-night',
    });
    expect(account.init!.headers).toEqual({ Authorization: 'Bearer lip_token' });
    const lichess = { username: 'learner', token: 'lip_token' };
    expect((await shown())?.lichess).toEqual(lichess);
    expect(saved()).toEqual({ version: 1, lichess });
  });

  it('forgets the account on signing out, revoking its token, offline too', async () => {
    localStorage.setItem(
      'accounts',
      JSON.stringify({ version: 1, lichess: { username: 'learner', token: 'lip_token' } }),
    );
    answers = [async () => Promise.reject(new Error('offline'))];
    const { controller, shown } = newStore();
    expect((await controller.fetch(getAccounts)).lichess?.username).toBe('learner');
    await controller.fetch(signOutLichess);

    expect(calls[0]).toMatchObject({
      url: 'https://lichess.org/api/token',
      init: { method: 'DELETE', headers: { Authorization: 'Bearer lip_token' } },
    });
    expect((await shown())?.lichess).toBeUndefined();
    expect(saved()).toEqual({ version: 1 });
  });

  it('keeps nothing when lichess refuses the code', async () => {
    answers = [async () => ({ ok: false, status: 400 }) as Response];
    const { controller } = newStore();
    await expect(controller.fetch(signInLichess, GRANT)).rejects.toThrow('lichess answered 400');
    expect(saved()).toBeNull();
  });

  it("asks the explorer with the account's token, and not at all without one", async () => {
    const { controller } = newStore();
    await expect(controller.fetch(getExplorerCounts, 1400, CASTLES)).rejects.toThrow(
      'Sign in with lichess',
    );
    expect(calls).toEqual([]);

    localStorage.setItem(
      'accounts',
      JSON.stringify({ version: 1, lichess: { username: 'learner', token: 'lip_token' } }),
    );
    answers = [
      json({
        white: 6,
        draws: 2,
        black: 2,
        moves: [{ uci: 'e1h1', white: 6, draws: 2, black: 2 }],
      }),
    ];
    expect(await controller.fetch(getExplorerCounts, 1400, CASTLES)).toEqual({
      counts: { e1g1: 10 },
      total: 10,
    });
    expect(calls[0].init!.headers).toEqual({ Authorization: 'Bearer lip_token' });
  });

  it('signs out when the explorer refuses the token, so the finder goes back to Maia', async () => {
    localStorage.setItem(
      'accounts',
      JSON.stringify({ version: 1, lichess: { username: 'learner', token: 'lip_token' } }),
    );
    answers = [async () => ({ ok: false, status: 401 }) as Response, json({})];
    const { controller, shown } = newStore();
    await controller.fetch(getAccounts);
    await expect(controller.fetch(getExplorerCounts, 1400, CASTLES)).rejects.toThrow('401');
    expect((await shown())?.lichess).toBeUndefined();
    expect(calls.at(-1)?.init?.method).toBe('DELETE');
  });
});
