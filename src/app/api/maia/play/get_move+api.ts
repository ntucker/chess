import { MAIA_API_ORIGIN } from '@/resources/maia';

/**
 * Forwards the web build's requests for Maia's move to Maia's API, which
 * the browser can't call itself (no CORS headers). See src/resources/maia.ts.
 */
export async function POST(request: Request): Promise<Response> {
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
