import { useController } from '@data-client/react';
import { ResponseType, useAuthRequest } from 'expo-auth-session';
import { useState } from 'react';

import { signInLichess } from '@/resources/accounts';

import { LICHESS_CLIENT_ID, LICHESS_DISCOVERY, lichessRedirectUri } from './oauth';

/** How a sign-in stands: not started or done, waiting on lichess, or failed. */
export type SignInState = 'idle' | 'signing-in' | 'failed';

/**
 * Signs in with lichess: `signIn` opens lichess's sign-in page (a popup on
 * the web, the system browser on the phone), then trades its answer for a
 * token and saves the account (`signInLichess`). Closing the page without
 * signing in leaves things as they were.
 *
 * ```ts
 * const { signIn, state } = useLichessSignIn();
 * ```
 */
export function useLichessSignIn() {
  const ctrl = useController();
  const [state, setState] = useState<SignInState>('idle');
  const [request, , promptAsync] = useAuthRequest(
    {
      clientId: LICHESS_CLIENT_ID,
      redirectUri: lichessRedirectUri(),
      responseType: ResponseType.Code,
      scopes: [],
      usePKCE: true,
    },
    LICHESS_DISCOVERY,
  );
  const signIn = async () => {
    if (!request?.codeVerifier) return;
    setState('signing-in');
    try {
      const result = await promptAsync();
      if (result.type === 'success') {
        await ctrl.fetch(signInLichess, {
          code: result.params.code,
          codeVerifier: request.codeVerifier,
          redirectUri: request.redirectUri,
        });
      }
      setState(result.type === 'error' ? 'failed' : 'idle');
    } catch {
      setState('failed');
    }
  };
  return { signIn: request ? signIn : undefined, state };
}
