/** What the app says when a newer build has replaced the page's. */
export const NEW_VERSION = 'A new version is out.';

/**
 * A newer build of the web app has replaced the one this page loaded. A file
 * the page loads late (a screen, a lesson, Maia's worker) may then be gone
 * from the site: asking again can't help, but reloading the page can.
 */
export class NewVersionError extends Error {
  constructor(options?: ErrorOptions) {
    super(NEW_VERSION, options);
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
 * Whether the site serves a newer build than this page's. Failures that come
 * together share one check, and once replaced, the page stays replaced; any
 * other answer is asked again at the next failure.
 */
function isReplaced(): Promise<boolean> {
  checking ??= checkReplaced().then((replaced) => {
    if (!replaced) checking = undefined;
    return replaced;
  });
  return checking;
}
let checking: Promise<boolean> | undefined;

/** How long the check waits for the site before it takes the page's build as current. */
const CHECK_MS = 3000;

/**
 * Asks the site whether it has a newer build: the HTML at the address the page
 * first loaded names a script the page didn't load. A file any screen loads
 * late is named in a script that HTML loads, so a new build of any of them
 * shows there. Offline, slow, or outside a web page, it's false.
 */
async function checkReplaced(): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  const [first] = performance.getEntriesByType('navigation');
  const address = first?.name ?? location.href;
  let html: string;
  try {
    const response = await fetch(address, {
      cache: 'no-store',
      signal: AbortSignal.timeout(CHECK_MS),
    });
    html = await response.text();
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
