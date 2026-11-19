import { useEffect, useState } from 'react';

import type { Supervisor } from './engine';

/** The pause before the first restart. Each failure in a row doubles it, up to `LONGEST_PAUSE_MS`. */
const FIRST_PAUSE_MS = 1000;
const LONGEST_PAUSE_MS = 30_000;

/**
 * Restarts for a host's engine: `failed()` stops it at once and starts a new
 * one after the pause; `ready()` (a finished handshake) ends the run of
 * failures; a failure while a restart waits is the same failure; `cancel()`
 * calls off a waiting restart.
 */
export function restarts(setRunning: (running: boolean) => void): Supervisor & { cancel(): void } {
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
 * (`attachStockfish`) and to tell when it fails to start. `running` is false
 * from a failure until the restart, so a stuck engine stops at once.
 */
export function useRestarts(): readonly [running: boolean, supervisor: Supervisor] {
  const [running, setRunning] = useState(true);
  const [supervisor] = useState(() => restarts(setRunning));
  useEffect(() => supervisor.cancel, [supervisor]);
  return [running, supervisor];
}
