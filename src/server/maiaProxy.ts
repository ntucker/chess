import { MAIA_API_ORIGIN } from '../resources/maiaApi';

/**
 * Asks Maia for its move, passing on the query string and body of a request
 * for `/play/get_move` (see `getMaiaMove` in src/resources/maia.ts).
 *
 * Browsers can't call Maia themselves (it sends no CORS headers), so two
 * places forward their requests with this: the web server's API route
 * (src/app/api/maia) and the Cloudflare Worker that the GitHub Pages build
 * uses instead (workers/maia-proxy). The Worker bundles this file, so it may
 * only import modules that have no imports of their own.
 */
export async function forwardMaiaMove(request: Request): Promise<Response> {
  const { search } = new URL(request.url);
  let upstream: Response;
  try {
    upstream = await fetch(`${MAIA_API_ORIGIN}/play/get_move${search}`, {
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
