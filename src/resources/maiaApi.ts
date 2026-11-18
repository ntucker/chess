/**
 * Where Maia's API lives (https://www.maiachess.com). Its own module, with no
 * imports, because the app (src/resources/maia.ts) and the proxy that the
 * Cloudflare Worker bundles (src/server/maiaProxy.ts) both need it.
 */
export const MAIA_API_ORIGIN = 'https://www.maiachess.com/api/v1';
