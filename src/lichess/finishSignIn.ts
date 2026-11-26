import type { Controller } from '@data-client/react';

import { signInLichess } from '@/resources/accounts';

import { takePendingSignIn } from './oauth';

/** How a web sign-in ended in the popup: signed in as `username`, refused or failed, or nothing to finish. */
export type SignInOutcome =
  | { readonly type: 'signed-in'; readonly username: string }
  | { readonly type: 'refused' | 'failed' | 'none' };

/**
 * Finishes the web sign-in that lichess's answer (`search`, the popup's
 * query string) belongs to: trades its code for a token and saves the
 * account (`signInLichess`). Nothing to finish where no sign-in waits for
 * this answer (`takePendingSignIn`): a direct visit, or one already finished.
 */
export async function finishSignIn(ctrl: Controller, search: string): Promise<SignInOutcome> {
  const answer = new URLSearchParams(search);
  const pending = takePendingSignIn(answer.get('state') ?? '');
  if (!pending) return { type: 'none' };
  const code = answer.get('code');
  // Where the learner says no, lichess answers with an error instead of a code.
  if (!code) return { type: 'refused' };
  try {
    const { codeVerifier, redirectUri } = pending;
    const { lichess } = await ctrl.fetch(signInLichess, { code, codeVerifier, redirectUri });
    return { type: 'signed-in', username: lichess?.username ?? '' };
  } catch {
    return { type: 'failed' };
  }
}
