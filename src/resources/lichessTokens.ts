import { actionTypes, type Manager, type Middleware } from '@data-client/react';

import type { Accounts } from '@/accounts/accounts';
import type { PositionKey } from '@/lesson/lesson';
import { ExplorerRefusal } from '@/lichess/explorer';

import { getAccounts, signInLichess, signOutLichess } from './accounts';
import { getExplorerCounts } from './explorer';

/**
 * Keeps the explorer's answers in step with the lichess token. It signs out
 * when the explorer refuses the account's token (401: the learner revoked it
 * on lichess, or it expired), so the finder goes back to Maia's estimates
 * rather than failing at every position; only a refusal of the token saved
 * now arrives as one (`getExplorerCounts`). And when an account is signed in,
 * here or in another tab, it asks again for the answers that failed, which
 * the finder otherwise never asks for again.
 */
export class LichessTokens implements Manager {
  /** The explorer's failed answers by key, with what they asked. */
  private readonly failed = new Map<string, readonly [number, PositionKey]>();

  middleware: Middleware = (controller) => (next) => (action) => {
    if (action.type !== actionTypes.SET_RESPONSE) return next(action);
    if (action.endpoint === getExplorerCounts) {
      if (!action.error) this.failed.delete(action.key);
      else {
        this.failed.set(action.key, action.args as [number, PositionKey]);
        if (action.response instanceof ExplorerRefusal && action.response.status === 401) {
          void controller.fetch(signOutLichess);
        }
      }
    } else if (
      !action.error &&
      (action.endpoint === signInLichess || action.endpoint === getAccounts) &&
      (action.response as Accounts).lichess
    ) {
      // Controller.invalidateAll passes over keys that hold only an error.
      for (const args of this.failed.values())
        void controller.invalidate(getExplorerCounts, ...args);
      this.failed.clear();
    }
    return next(action);
  };

  cleanup() {}
}
