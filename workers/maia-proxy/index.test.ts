import { afterEach, describe, expect, it, jest } from '@jest/globals';

import worker from './index';

const env = { ALLOWED_ORIGINS: 'https://ntucker.github.io, http://localhost:8081' };
const url = 'https://proxy.example/play/get_move?maia_name=maia_kdd_1500';

function request(init: RequestInit & { origin?: string; path?: string } = {}) {
  const { origin = 'https://ntucker.github.io', path, ...rest } = init;
  return new Request(path ? `https://proxy.example${path}` : url, {
    method: 'POST',
    body: '["e2e4"]',
    ...rest,
    headers: { Origin: origin, 'Content-Type': 'application/json' },
  });
}

describe('Maia proxy worker', () => {
  const fetchMock = jest.spyOn(globalThis, 'fetch');
  afterEach(() => {
    fetchMock.mockReset();
  });

  it('forwards the move request to Maia and allows the calling page to read it', async () => {
    fetchMock.mockResolvedValue(Response.json({ top_move: 'e7e5', move_delay: 1 }));
    const response = await worker.fetch(request(), env);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [upstreamUrl, init] = fetchMock.mock.calls[0];
    expect(upstreamUrl).toBe(
      'https://www.maiachess.com/api/v1/play/get_move?maia_name=maia_kdd_1500',
    );
    expect(init?.body).toBe('["e2e4"]');
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://ntucker.github.io');
    expect(await response.json()).toEqual({ top_move: 'e7e5', move_delay: 1 });
  });

  it('answers the CORS preflight without calling Maia', async () => {
    const response = await worker.fetch(
      request({ method: 'OPTIONS', body: null, origin: 'http://localhost:8081' }),
      env,
    );
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:8081');
    expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses other sites', async () => {
    const response = await worker.fetch(request({ origin: 'https://elsewhere.example' }), env);
    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses other paths', async () => {
    const response = await worker.fetch(request({ path: '/play/other' }), env);
    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
