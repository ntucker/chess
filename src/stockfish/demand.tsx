import {
  createContext,
  type Dispatch,
  type ReactElement,
  type ReactNode,
  type SetStateAction,
  use,
  useEffect,
  useState,
} from 'react';

import { requireProvider } from '@/context/requireProvider';
import { useSettings } from '@/settings/SettingsProvider';

/**
 * How long Stockfish keeps running once nothing needs it, so stepping out of
 * a lesson and back doesn't start it again (about 0.75 s on a phone).
 */
export const KEEP_MS = 60_000;

/** Lets a screen add itself to, or take itself off, the count of screens that need Stockfish. */
const DemandContext = createContext<Dispatch<SetStateAction<number>> | null>(null);

/**
 * Runs Stockfish lite while the evaluation bar or the opponent uses it, or a
 * screen calls `useNeedsStockfish(true)` (a lesson, which always labels moves
 * with it), and full Stockfish while it's the opponent. Once nothing needs
 * one, it stops after `KEEP_MS`, which frees its memory. The root layout
 * renders it once around every screen, with `<StockfishHost />` as `host`
 * and `<FullStockfishHost />` as `fullHost`; it takes the hosts as props so
 * screens calling the hook don't import the engines.
 */
export function StockfishWhileNeeded({
  host,
  fullHost,
  children,
}: {
  readonly host: ReactElement;
  readonly fullHost: ReactElement;
  readonly children: ReactNode;
}) {
  const { evaluationEngine, opponent } = useSettings();
  const [screens, setScreens] = useState(0);
  const lite = useKept(evaluationEngine === 'stockfish' || opponent === 'stockfish' || screens > 0);
  const full = useKept(opponent === 'stockfish-full');
  return (
    <DemandContext value={setScreens}>
      {children}
      {lite ? host : null}
      {full ? fullHost : null}
    </DemandContext>
  );
}

/** Whether to run an engine: from when it's `needed` until `KEEP_MS` after it no longer is. */
function useKept(needed: boolean): boolean {
  const [running, setRunning] = useState(needed);
  if (needed && !running) setRunning(true);
  useEffect(() => {
    if (needed || !running) return;
    const timer = setTimeout(() => setRunning(false), KEEP_MS);
    return () => clearTimeout(timer);
  }, [needed, running]);
  return running;
}

/**
 * Keeps Stockfish running while `needed`, beside what the settings ask for.
 * A screen whose requests need it says so here rather than the root guessing
 * from routes.
 */
export function useNeedsStockfish(needed: boolean) {
  const setScreens = requireProvider(use(DemandContext), 'StockfishWhileNeeded');
  useEffect(() => {
    if (!needed) return;
    setScreens((screens) => screens + 1);
    return () => setScreens((screens) => screens - 1);
  }, [needed, setScreens]);
}
