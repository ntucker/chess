import type { Controller } from '@data-client/react';

import { signInLichess } from '@/resources/accounts';

import { isSignInPending, takePendingSignIn } from './oauth';

/** How a web sign-in ended in the popup: signed in as `username`, refused, failed, replaced by a later one, or nothing to finish. */
export type SignInOutcome =
  | { readonly type: 'signed-in'; readonly username: string }
  | { readonly type: 'refused' }
  | { readonly type: 'replaced' }
  | { readonly type: 'failed' }
  | { readonly type: 'none' };

/**
 * Finishes the web sign-in that lichess's answer (`search`, the popup's
 * query string) belongs to: trades its code for a token and saves the
 * account (`signInLichess`). Replaced where another sign-in waits instead
 * (the learner pressed again while this popup was open), and nothing to
 * finish where none waits: a direct visit, or one already finished.
 */
export async function finishSignIn(ctrl: Controller, search: string): Promise<SignInOutcome> {
  const answer = new URLSearchParams(search);
  const state = answer.get('state');
  const pending = takePendingSignIn(state ?? '');
  // An answer to an earlier press, after a later one began its own sign-in.
  if (!pending) return state && isSignInPending() ? { type: 'replaced' } : { type: 'none' };
  const code = answer.get('code');
  // Where the learner says no, lichess answers with an error instead of a code.
  if (!code) return { type: 'refused' };
  try {
    const { codeVerifier, redirectUri } = pending;
    const { lichess } = await ctrl.fetch(signInLichess, { code, codeVerifier, redirectUri });
    return lichess ? { type: 'signed-in', username: lichess.username } : { type: 'failed' };
  } catch {
    return { type: 'failed' };
  }
}
