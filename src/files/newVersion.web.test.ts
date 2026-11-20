import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type * as NewVersion from './newVersion';

const PAGE = 'http://localhost/chess/play';
const page = (...scripts: string[]) =>
  `<!DOCTYPE html><html><head>${scripts.map((src) => `<script defer src="${src}"></script>`).join('')}</head><body></body></html>`;
const OLD = ['/chess/_expo/static/js/web/play-old.js', '/chess/_expo/static/js/web/entry-old.js'];
const NEW = ['/chess/_expo/static/js/web/play-new.js', OLD[1]];

/** The HTML the site serves now at PAGE. */
let served: () => Promise<string>;
let fetched: jest.Mock<(url: string, init: RequestInit) => Promise<Pick<Response, 'ok' | 'text'>>>;
/** A fresh copy of the module each test, since it remembers a replaced build. */
let explainLoadFailure: typeof NewVersion.explainLoadFailure;
let NewVersionError: typeof NewVersion.NewVersionError;

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
  // jsdom has no Response either. Tests check the address after the call,
  // since a throw in here would read as offline.
  fetched = jest.fn(() => served().then((html) => ({ ok: true, text: async () => html })));
  globalThis.fetch = fetched as unknown as typeof fetch;
  jest.isolateModules(() => {
    ({ explainLoadFailure, NewVersionError } =
      jest.requireActual<typeof NewVersion>('./newVersion'));
  });
});

describe('explainLoadFailure', () => {
  const failure = new Error('Loading module play-old.js failed.');

  it('keeps the error while the site still serves the page’s build', async () => {
    served = async () => page(...OLD);
    expect(await explainLoadFailure(failure)).toBe(failure);
    expect(fetched).toHaveBeenCalledWith(PAGE, expect.anything());
  });

  it('says a new version is out once the site serves another build', async () => {
    served = async () => page(...NEW);
    const explained = await explainLoadFailure(failure);
    expect(explained).toBeInstanceOf(NewVersionError);
    expect(explained).toMatchObject({ message: 'A new version is out.', cause: failure });
  });

  it('reads the address the page first loaded, not where it went since', async () => {
    history.pushState(null, '', '/chess/lesson/caro-kann');
    served = async () => page(...NEW);
    expect(await explainLoadFailure(failure)).toBeInstanceOf(NewVersionError);
    expect(fetched).toHaveBeenCalledWith(PAGE, expect.anything());
  });

  it('keeps the error when the site answers with an error page', async () => {
    fetched.mockResolvedValueOnce({ ok: false, text: async () => page(...NEW) });
    expect(await explainLoadFailure(failure)).toBe(failure);
  });

  it('asks with a time limit, so a slow site counts as not replaced', async () => {
    served = async () => page(...OLD);
    await explainLoadFailure(failure);
    expect(fetched.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('keeps the error offline', async () => {
    served = () => Promise.reject(new TypeError('Failed to fetch'));
    expect(await explainLoadFailure(failure)).toBe(failure);
    expect(fetched).toHaveBeenCalledTimes(1);
  });

  it('asks the site once for failures together, and again after an answer of no', async () => {
    served = async () => page(...OLD);
    await Promise.all([explainLoadFailure(failure), explainLoadFailure(failure)]);
    expect(fetched).toHaveBeenCalledTimes(1);
    served = async () => page(...NEW);
    expect(await explainLoadFailure(failure)).toBeInstanceOf(NewVersionError);
    expect(fetched).toHaveBeenCalledTimes(2);
  });

  it('stays replaced without asking again', async () => {
    served = async () => page(...NEW);
    await explainLoadFailure(failure);
    expect(await explainLoadFailure(failure)).toBeInstanceOf(NewVersionError);
    expect(fetched).toHaveBeenCalledTimes(1);
  });
});
