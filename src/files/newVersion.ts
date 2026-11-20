/**
 * A newer build of the web app has replaced the one this page loaded. A file
 * the page loads late (a screen, a lesson, Maia's worker) may then be gone
 * from the site: asking again can't help, but reloading the page can.
 */
export class NewVersionError extends Error {
  constructor(options?: ErrorOptions) {
    super('A new version is out.', options);
    this.name = 'NewVersionError';
  }
}

/**
 * `error`, a failure to load part of the app, or a NewVersionError caused by
 * it when the site has deployed a newer build since this page loaded.
 *
 * ```ts
 * const lesson = await import('./lesson.json').catch(async (error) => {
 *   throw await explainLoadFailure(error);
 * });
 * ```
 */
export async function explainLoadFailure<E>(error: E): Promise<E | NewVersionError> {
  return (await isReplaced()) ? new NewVersionError({ cause: error }) : error;
}

/**
 * Whether the site now serves a newer build than this page's: the HTML at the
 * address the page first loaded names a script the page didn't load. A file
 * any screen loads late is named in a script that HTML loads, so a new build
 * of any of them shows there. Offline, or outside a web page, it's false.
 */
async function isReplaced(): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  const [first] = performance.getEntriesByType('navigation');
  const address = first?.name ?? location.href;
  let html: string;
  try {
    html = await (await fetch(address, { cache: 'no-store' })).text();
  } catch {
    return false;
  }
  const loaded = new Set(Array.from(document.scripts, (script) => script.src));
  const served = new DOMParser().parseFromString(html, 'text/html').scripts;
  return Array.from(served).some((script) => {
    const src = script.getAttribute('src');
    return src !== null && !loaded.has(new URL(src, address).href);
  });
}

/** Loads the page again, from the site's newest build. */
export function reload() {
  location.reload();
}
