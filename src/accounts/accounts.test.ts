import { describe, expect, it } from '@jest/globals';

import { accountsText, parseAccounts } from './accounts';

const LICHESS = { username: 'learner', token: 'lip_token' };

describe('parseAccounts', () => {
  it('reads back what accountsText writes', () => {
    expect(parseAccounts(accountsText({ lichess: LICHESS }))).toEqual({ lichess: LICHESS });
    expect(parseAccounts(accountsText({}))).toEqual({});
  });

  it('reads a save in another version, a damaged one, or an account missing a field as none', () => {
    expect(parseAccounts(JSON.stringify({ version: 2, lichess: LICHESS }))).toEqual({});
    expect(parseAccounts(JSON.stringify({ lichess: LICHESS }))).toEqual({});
    expect(parseAccounts('{"version":1,')).toEqual({});
    expect(parseAccounts('')).toEqual({});
    expect(parseAccounts(JSON.stringify({ version: 1, lichess: { username: 'learner' } }))).toEqual(
      {},
    );
  });
});
