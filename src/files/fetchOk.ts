/**
 * Fetches `url`, rejecting when the server answers with an error status
 * (`url: HTTP 404`) as well as when the request fails. Uses only the DOM, so
 * workers and web views can use it too.
 */
export async function fetchOk(url: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response;
}
