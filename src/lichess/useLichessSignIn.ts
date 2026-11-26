import { useController } from '@data-client/react';
import { ResponseType, useAuthRequest } from 'expo-auth-session';
import { useState } from 'react';

import { signInLichess } from '@/resources/accounts';

import {
  LICHESS_CLIENT_ID,
  LICHESS_DISCOVERY,
  lichessRedirectUri,
  savePendingSignIn,
} from './oauth';

/** How a sign-in stands: not started or done, waiting on lichess, or failed. */
export type SignInState = 'idle' | 'signing-in' | 'failed';

/**
 * Signs in with lichess: `signIn` opens lichess's sign-in page (a popup on
 * the web, the system browser on the phone), then trades its answer for a
 * token and saves the account (`signInLichess`). Closing the page without
 * signing in leaves things as they were. On the web the popup trades the
 * answer itself (`savePendingSignIn`, src/components/LichessReturn.tsx),
 * since lichess's page cuts it off from this one, which then takes in the
 * saved account as it takes in another tab's (`AccountsSync`): here the
 * popup reads as closed at once, and the state goes back to idle. So the
 * learner can press again while the first popup is still on lichess: each
 * web press therefore gets a request of its own (`nextState`), whose saved
 * sign-in replaces the earlier one, and the earlier popup's answer reads as
 * replaced (`finishSignIn`).
 *
 * ```ts
 * const { signIn, state } = useLichessSignIn();
 * ```
 */
export function useLichessSignIn() {
  const ctrl = useController();
  const [state, setState] = useState<SignInState>('idle');
  const [oauthState, setOauthState] = useState(nextState);
  // A new `state` makes useAuthRequest build a new request: a new verifier and sign-in address too.
  const [request, , promptAsync] = useAuthRequest(
    {
      clientId: LICHESS_CLIENT_ID,
      state: oauthState,
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
    if (process.env.EXPO_OS === 'web') {
      const { state: answer, codeVerifier, redirectUri } = request;
      savePendingSignIn({ state: answer, codeVerifier, redirectUri });
      setOauthState(nextState());
    }
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

/**
 * The OAuth `state` for the next sign-in: a new random one on the web, where
 * one press's popup can outlast the next press (`useLichessSignIn`); on the
 * phone, where one sign-in runs at a time, the request's own.
 */
const nextState = () => (process.env.EXPO_OS === 'web' ? crypto.randomUUID() : undefined);
