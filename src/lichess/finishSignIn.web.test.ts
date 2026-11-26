import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { newController } from '@/resources/testing';

import { finishSignIn } from './finishSignIn';
import { savePendingSignIn, takePendingSignIn } from './oauth';

const PENDING = {
  state: 'abc',
  codeVerifier: 'verifier',
  redirectUri: 'https://ntucker.github.io/chess/lichess',
};
const saved = () => JSON.parse(localStorage.getItem('accounts') ?? 'null');

let calls: { url: string; init?: RequestInit }[] = [];
let answers: (() => Promise<Response>)[] = [];
const json = (body: object) => async () =>
  ({ ok: true, status: 200, json: async () => body }) as Response;

afterEach(() => {
  jest.useRealTimers();
});
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

describe('a web sign-in waiting for lichess', () => {
  it('is taken once, by the answer that repeats its state', () => {
    savePendingSignIn(PENDING);
    expect(takePendingSignIn('other')).toBeUndefined();
    expect(takePendingSignIn('abc')).toEqual(PENDING);
    expect(takePendingSignIn('abc')).toBeUndefined();
    expect(takePendingSignIn('')).toBeUndefined();
  });

  it('waits however long the learner takes on lichess', () => {
    // lichess's one-time code expires on its side; a slow login (two-factor, a reset) still finishes.
    jest.useFakeTimers();
    savePendingSignIn(PENDING);
    jest.advanceTimersByTime(60 * 60 * 1000);
    expect(takePendingSignIn('abc')).toEqual(PENDING);
  });

  it('is replaced by a later sign-in', () => {
    savePendingSignIn(PENDING);
    savePendingSignIn({ ...PENDING, state: 'later' });
    expect(takePendingSignIn('abc')).toBeUndefined();
    expect(takePendingSignIn('later')?.state).toBe('later');
  });
});

describe("the popup's answer from lichess", () => {
  it('trades the code with the waiting verifier and saves the account', async () => {
    savePendingSignIn(PENDING);
    answers = [json({ access_token: 'lip_token' }), json({ username: 'learner' })];
    const outcome = await finishSignIn(newController(), '?code=c&state=abc');

    expect(outcome).toEqual({ type: 'signed-in', username: 'learner' });
    expect(Object.fromEntries(calls[0].init!.body as URLSearchParams)).toMatchObject({
      code: 'c',
      code_verifier: 'verifier',
      redirect_uri: PENDING.redirectUri,
    });
    expect(saved()).toEqual({ version: 1, lichess: { username: 'learner', token: 'lip_token' } });
    // A second run of the page has nothing left to trade.
    expect(await finishSignIn(newController(), '?code=c&state=abc')).toEqual({ type: 'none' });
    expect(calls).toHaveLength(2);
  });

  it('is refused where lichess answers with an error instead of a code', async () => {
    savePendingSignIn(PENDING);
    expect(await finishSignIn(newController(), '?error=access_denied&state=abc')).toEqual({
      type: 'refused',
    });
    expect(calls).toEqual([]);
  });

  it('fails where lichess refuses the code, keeping nothing', async () => {
    savePendingSignIn(PENDING);
    answers = [async () => ({ ok: false, status: 400 }) as Response];
    expect(await finishSignIn(newController(), '?code=c&state=abc')).toEqual({ type: 'failed' });
    expect(saved()).toBeNull();
  });

  it('has nothing to finish for an answer no sign-in waits for', async () => {
    savePendingSignIn(PENDING);
    expect(await finishSignIn(newController(), '?code=c&state=forged')).toEqual({ type: 'none' });
    expect(await finishSignIn(newController(), '')).toEqual({ type: 'none' });
    expect(calls).toEqual([]);
  });
});
