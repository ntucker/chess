import { useEffect, useState } from 'react';

/** How long a wait lasts before it shows. */
export const LONG_WAIT_MS = 500;

/**
 * Whether `pending` has lasted `LONG_WAIT_MS`: a shorter wait shows nothing,
 * so a quick one doesn't flicker.
 */
export function useLongWait(pending: boolean) {
  const [long, setLong] = useState(false);
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setLong(true), LONG_WAIT_MS);
    return () => {
      clearTimeout(timer);
      setLong(false);
    };
  }, [pending]);
  return pending && long;
}
