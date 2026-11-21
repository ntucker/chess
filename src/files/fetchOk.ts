/** A server answered `url` with an error `status`. */
export class HttpError extends Error {
  constructor(
    readonly url: string,
    readonly status: number,
  ) {
    super(`${url}: HTTP ${status}`);
    this.name = 'HttpError';
  }
}

/**
 * Fetches `url`, rejecting with an HttpError when the server answers with an
 * error status, as well as when the request fails. Uses only the DOM, so
 * workers and web views can use it too.
 */
export async function fetchOk(url: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(url, init);
  if (!response.ok) throw new HttpError(url, response.status);
  return response;
}
