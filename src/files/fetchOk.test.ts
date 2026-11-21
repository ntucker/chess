import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { fetchOk, HttpError } from './fetchOk';

afterEach(() => {
  jest.restoreAllMocks();
});

describe('fetchOk', () => {
  it('answers with the response when the server says OK, passing on how to fetch', async () => {
    const ok = new Response('body');
    const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(ok);
    const signal = new AbortController().signal;
    expect(await fetchOk('https://example.test/a', { signal })).toBe(ok);
    expect(fetch).toHaveBeenCalledWith('https://example.test/a', { signal });
  });

  it('rejects with the status when the server answers with an error', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 404 }));
    const failure = fetchOk('https://example.test/a');
    await expect(failure).rejects.toBeInstanceOf(HttpError);
    await expect(failure).rejects.toMatchObject({
      message: 'https://example.test/a: HTTP 404',
      status: 404,
    });
  });
});
