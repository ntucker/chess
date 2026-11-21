/** What the app says when a newer build has replaced the page's. */
export const NEW_VERSION = 'A new version is out.';

/** What the app needs when a reload can't bring the newer build, as it reads after "needs". */
export type Needs = 'an app update' | 'a newer preview';

/**
 * A newer build of the web app has replaced the one this page loaded. A file
 * the page loads late (a lesson, Maia's worker) may then be gone
 * from the site: asking again can't help, but reloading the page can. Full
 * Stockfish's files (src/stockfish/full.ts) say the same when their folder
 * serves another build.
 */
export class NewVersionError extends Error {
  /** What the app needs where a reload can't help either, which full Stockfish's hosts add. */
  readonly needs?: Needs;

  constructor(options?: ErrorOptions & { readonly needs?: Needs }) {
    super(NEW_VERSION, options);
    this.name = 'NewVersionError';
    this.needs = options?.needs;
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
 * The check for a newer build, while it runs or once it found one: a page
 * replaced stays replaced, and any other answer is asked again at the next
 * failure.
 */
let replacedCheck: Promise<boolean> | undefined;

/** Whether the site serves a newer build than this page's. Failures that come together share one check. */
function isReplaced(): Promise<boolean> {
  replacedCheck ??= checkReplaced().then((replaced) => {
    if (!replaced) replacedCheck = undefined;
    return replaced;
  });
  return replacedCheck;
}

/** How long the check waits for the site before it takes the page's build as current. */
const CHECK_MS = 3000;

/**
 * Asks the site whether it has a newer build: the HTML at the address the page
 * first loaded names a script the page didn't load. A file any screen loads
 * late is named in a script that HTML loads, so a new build of any of them
 * shows there. Offline, slow, answering with an error page, or outside a web
 * page, it's false.
 */
async function checkReplaced(): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  const [first] = performance.getEntriesByType('navigation');
  const address = first?.name ?? location.href;
  try {
    const response = await fetch(address, {
      cache: 'no-store',
      signal: AbortSignal.timeout(CHECK_MS),
    });
    if (!response.ok) return false;
    const loaded = new Set(Array.from(document.scripts, (script) => script.src));
    const served = new DOMParser().parseFromString(await response.text(), 'text/html').scripts;
    return Array.from(served).some((script) => {
      const src = script.getAttribute('src');
      return src !== null && !loaded.has(new URL(src, address).href);
    });
  } catch {
    return false;
  }
}

/** Loads the page again, from the site's newest build. */
export function reload() {
  location.reload();
}
