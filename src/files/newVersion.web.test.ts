import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { explainLoadFailure, NewVersionError } from './newVersion';

const PAGE = 'http://localhost/chess/play';
const page = (...scripts: string[]) =>
  `<!DOCTYPE html><html><head>${scripts.map((src) => `<script defer src="${src}"></script>`).join('')}</head><body></body></html>`;
const OLD = ['/chess/_expo/static/js/web/play-old.js', '/chess/_expo/static/js/web/entry-old.js'];

/** The HTML the site serves now at PAGE. */
let served: () => Promise<string>;

beforeEach(() => {
  // The page as it loaded: its build's scripts.
  document.head.innerHTML = '';
  for (const src of OLD) {
    const script = document.createElement('script');
    script.src = src;
    document.head.append(script);
  }
  // jsdom has no navigation timing: the page first loaded at PAGE.
  performance.getEntriesByType = () => [{ name: PAGE } as PerformanceEntry];
  globalThis.fetch = jest.fn((url: RequestInfo | URL) => {
    expect(String(url)).toBe(PAGE);
    // jsdom has no Response either.
    return served().then((html) => ({ text: async () => html }));
  }) as unknown as typeof fetch;
});

describe('explainLoadFailure', () => {
  const failure = new Error('Loading module play-old.js failed.');

  it('keeps the error while the site still serves the page’s build', async () => {
    served = async () => page(...OLD);
    expect(await explainLoadFailure(failure)).toBe(failure);
  });

  it('says a new version is out once the site serves another build', async () => {
    served = async () => page('/chess/_expo/static/js/web/play-new.js', OLD[1]);
    const explained = await explainLoadFailure(failure);
    expect(explained).toBeInstanceOf(NewVersionError);
    expect(explained).toMatchObject({ message: 'A new version is out.', cause: failure });
  });

  it('reads the address the page first loaded, not where it went since', async () => {
    history.pushState(null, '', '/chess/lesson/caro-kann');
    served = async () => page(...OLD);
    expect(await explainLoadFailure(failure)).toBe(failure);
  });

  it('keeps the error offline', async () => {
    served = () => Promise.reject(new TypeError('Failed to fetch'));
    expect(await explainLoadFailure(failure)).toBe(failure);
  });
});
