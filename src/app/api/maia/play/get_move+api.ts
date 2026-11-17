import { forwardMaiaMove } from '@/server/maiaProxy';

/**
 * Forwards the web build's requests for Maia's move to Maia's API, which
 * the browser can't call itself (no CORS headers). See src/resources/maia.ts.
 */
export function POST(request: Request): Promise<Response> {
  return forwardMaiaMove(request);
}
