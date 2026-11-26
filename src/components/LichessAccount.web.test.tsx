// Renders Silk, which ships ES modules: the web project's transformIgnorePatterns
// (package.json) lets @reactive through Babel for it.
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { DataProvider } from '@data-client/react';
import { SilkProvider } from '@reactive/silk-native';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { parseStoredObject, readStorage, storageKey } from '@/context/storage';
import { themes } from '@/theme/theme';

import { LichessAccount } from './LichessAccount';

jest.mock('@expo/vector-icons/Ionicons', () => () => null);
// lichess's sign-in page answers with a code, or the learner closes it.
const mockBuilding = { on: false, built: '' };
const mockPrompt = jest.fn(async () => ({ type: 'success', params: { code: 'code' } }));
jest.mock('expo-auth-session', () => ({
  ResponseType: { Code: 'code' },
  // A request built from the hook's config, as expo-auth-session builds one, with its own state
  // where the config gives none. While `mockBuilding`, the last request stays (it builds async).
  useAuthRequest: ({ state = 'first' }: { state?: string }) => {
    if (!mockBuilding.on) mockBuilding.built = state;
    const built = mockBuilding.built;
    return [
      { state: built, codeVerifier: `verifier ${built}`, redirectUri: 'http://localhost/lichess' },
      null,
      mockPrompt,
    ];
  },
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let calls: { url: string; init?: RequestInit }[] = [];
const json = (body: object) => ({ ok: true, status: 200, json: async () => body }) as Response;
let host: HTMLElement;
let root: Root;

const render = () =>
  act(async () =>
    root.render(
      <DataProvider>
        <SilkProvider theme={themes.dark}>
          <LichessAccount />
        </SilkProvider>
      </DataProvider>,
    ),
  );

beforeEach(async () => {
  localStorage.clear();
  mockBuilding.on = false;
  calls = [];
  globalThis.fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (init?.method === 'DELETE') return json({});
    return json(
      String(url).endsWith('/api/token') ? { access_token: 'lip_token' } : { username: 'learner' },
    );
  };
  host = document.createElement('div');
  root = createRoot(host);
  await render();
});
afterEach(() => act(() => root.unmount()));

const button = () => host.querySelector<HTMLElement>('[role="button"]')!;
const press = () => act(async () => button().click());

describe('LichessAccount', () => {
  it('signs in from its button, then names the account and signs out from it', async () => {
    expect(button().getAttribute('aria-label')).toBe('Sign in with lichess');
    expect(host.textContent).toContain('counts real games');
    await press();
    expect(mockPrompt).toHaveBeenCalled();
    expect(button().getAttribute('aria-label')).toBe('Sign out of lichess (learner)');
    expect(host.textContent).toContain('Signed in to lichess as learner');

    await press();
    expect(calls.at(-1)?.init?.method).toBe('DELETE');
    expect(button().getAttribute('aria-label')).toBe('Sign in with lichess');
  });

  it('stays signed out when the learner closes the sign-in page', async () => {
    mockPrompt.mockResolvedValueOnce({ type: 'dismiss' } as never);
    await press();
    expect(calls).toEqual([]);
    expect(button().getAttribute('aria-label')).toBe('Sign in with lichess');
  });

  it('gives each press a sign-in of its own, which replaces the one an earlier press saved', async () => {
    // On the web lichess's page cuts the popup off, so it reads as closed and the button comes back.
    mockPrompt.mockResolvedValueOnce({ type: 'dismiss' } as never);
    mockPrompt.mockResolvedValueOnce({ type: 'dismiss' } as never);
    const pending = () => parseStoredObject(readStorage(storageKey('lichess-sign-in')) ?? '');
    await press();
    const first = pending();
    await press();
    const second = pending();
    expect(first.state).toEqual(expect.any(String));
    expect(second.state).not.toBe(first.state);
    expect(second.codeVerifier).toBe(`verifier ${second.state}`);
  });

  it('waits for the next request to be built before another press', async () => {
    mockPrompt.mockResolvedValueOnce({ type: 'dismiss' } as never);
    mockBuilding.on = true;
    await press();
    expect(button().getAttribute('aria-disabled')).toBe('true');
    mockBuilding.on = false;
    await render();
    expect(button().getAttribute('aria-disabled')).not.toBe('true');
  });

  it('says on the button itself when signing in failed', async () => {
    mockPrompt.mockResolvedValueOnce({ type: 'error' } as never);
    await press();
    expect(button().getAttribute('aria-label')).toBe(
      'Signing in with lichess failed. Press to try again.',
    );
  });
});
