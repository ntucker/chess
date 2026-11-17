import { forwardMaiaMove } from '../../src/server/maiaProxy';

/**
 * A Cloudflare Worker that forwards the web app's requests for Maia's move
 * to Maia's API, adding the CORS headers Maia leaves out. The GitHub Pages
 * build needs it because Pages only serves static files, so the app's own
 * API route (src/app/api/maia) doesn't exist there.
 *
 * It answers only `POST /play/get_move`, and only for pages on
 * ALLOWED_ORIGINS, so it can't be used as a general-purpose proxy.
 */
export interface Env {
  /** Origins that may call it, comma-separated: `https://ntucker.github.io`. */
  ALLOWED_ORIGINS: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin') ?? '';
    const allowed = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim());
    if (!allowed.includes(origin)) {
      return new Response('Origin not allowed', { status: 403 });
    }
    if (new URL(request.url).pathname !== '/play/get_move') {
      return withCors(new Response('Not found', { status: 404 }), origin);
    }
    if (request.method === 'OPTIONS') {
      return withCors(new Response(null, { status: 204 }), origin, {
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      });
    }
    if (request.method !== 'POST') {
      return withCors(new Response('Method not allowed', { status: 405 }), origin);
    }
    return withCors(await forwardMaiaMove(request), origin);
  },
};

function withCors(
  response: Response,
  origin: string,
  extra: Record<string, string> = {},
): Response {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Vary', 'Origin');
  for (const [name, value] of Object.entries(extra)) headers.set(name, value);
  return new Response(response.body, { status: response.status, headers });
}
