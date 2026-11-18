import { MAIA_API_ORIGIN, MAIA_MOVE_PATH } from '../resources/maiaApi';

/**
 * Asks Maia for its move, passing on the query string and body of a request
 * from `getMaiaMove` (src/resources/maia.ts).
 *
 * Browsers can't call Maia themselves (it sends no CORS headers), so the web
 * build's requests are forwarded with this: by the server's API route
 * (src/app/api/maia), or on GitHub Pages, which only serves files, by a
 * Cloudflare Worker (workers/maia-proxy). The Worker bundles this file, so
 * keep its imports to src/resources/maiaApi.ts.
 */
export async function forwardMaiaMove(request: Request): Promise<Response> {
  const { search } = new URL(request.url);
  let upstream: Response;
  try {
    upstream = await fetch(`${MAIA_API_ORIGIN}${MAIA_MOVE_PATH}${search}`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: await request.text(),
    });
  } catch (error) {
    return Response.json({ detail: `Couldn't reach Maia: ${String(error)}` }, { status: 502 });
  }
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json' },
  });
}
