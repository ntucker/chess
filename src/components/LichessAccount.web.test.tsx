// Renders Silk, which ships ES modules: the web project's transformIgnorePatterns
// (package.json) lets @reactive through Babel for it.
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { DataProvider } from '@data-client/react';
import { SilkProvider } from '@reactive/silk-native';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { themes } from '@/theme/theme';

import { LichessAccount } from './LichessAccount';

jest.mock('@expo/vector-icons/Ionicons', () => () => null);
// lichess's sign-in page answers with a code, or the learner closes it.
const mockPrompt = jest.fn(async () => ({ type: 'success', params: { code: 'code' } }));
jest.mock('expo-auth-session', () => ({
  ResponseType: { Code: 'code' },
  useAuthRequest: () => [
    { codeVerifier: 'verifier', redirectUri: 'http://localhost/lichess' },
    null,
    mockPrompt,
  ],
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let calls: { url: string; init?: RequestInit }[] = [];
const json = (body: object) => ({ ok: true, status: 200, json: async () => body }) as Response;
let host: HTMLElement;
let root: Root;

beforeEach(async () => {
  localStorage.clear();
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
  await act(async () =>
    root.render(
      <DataProvider>
        <SilkProvider theme={themes.dark}>
          <LichessAccount />
        </SilkProvider>
      </DataProvider>,
    ),
  );
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

  it('says on the button itself when signing in failed', async () => {
    mockPrompt.mockResolvedValueOnce({ type: 'error' } as never);
    await press();
    expect(button().getAttribute('aria-label')).toBe(
      'Signing in with lichess failed. Press to try again.',
    );
  });
});
