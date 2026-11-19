import { useEffect, useState } from 'react';

import type { Supervisor } from './engine';

/** The pause before the first restart. Each failure in a row doubles it, up to `LONGEST_PAUSE_MS`. */
const FIRST_PAUSE_MS = 1000;
const LONGEST_PAUSE_MS = 30_000;

/** Restarts an engine host's engine, as `useRestarts` does. */
interface Restarts extends Supervisor {
  /** Calls off a restart that's waiting. */
  cancel(): void;
}

/**
 * Restarts for a host's engine: `failed()` stops it at once
 * (`setRunning(false)`) and starts a new one (`setRunning(true)`) after a pause that doubles with each
 * failure since an engine last finished its handshake (`ready()`), so an
 * engine that can't start isn't restarted in a tight loop. A failure while
 * a restart waits is the same failure.
 */
export function restarts(setRunning: (running: boolean) => void): Restarts {
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    ready() {
      failures = 0;
    },
    failed() {
      if (timer !== undefined) return;
      const pause = Math.min(FIRST_PAUSE_MS * 2 ** failures, LONGEST_PAUSE_MS);
      failures += 1;
      setRunning(false);
      timer = setTimeout(() => {
        timer = undefined;
        setRunning(true);
      }, pause);
    },
    cancel() {
      clearTimeout(timer);
      timer = undefined;
    },
  };
}

/**
 * Whether a host runs its engine now, and the supervisor to attach it with
 * (`attachStockfish`) and to tell when it fails to start. After a failure
 * `running` is false until the restart: the host stops the failed engine
 * (a stuck one may still be using a core) and starts a new one when it turns
 * true again. Unmounting calls off a waiting restart.
 */
export function useRestarts(): readonly [running: boolean, supervisor: Supervisor] {
  const [running, setRunning] = useState(true);
  const [supervisor] = useState(() => restarts(setRunning));
  useEffect(() => supervisor.cancel, [supervisor]);
  return [running, supervisor];
}
