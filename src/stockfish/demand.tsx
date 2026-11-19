import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  use,
  useEffect,
  useState,
} from 'react';

import { useSettings } from '@/settings/SettingsProvider';

/** Lets a screen add itself to, or take itself off, the count of screens that need Stockfish. */
const DemandContext = createContext<Dispatch<SetStateAction<number>> | undefined>(undefined);

/**
 * Runs Stockfish while the evaluation bar or the opponent uses it, or a
 * screen calls `useNeedsStockfish(true)` (a lesson, which always labels moves
 * with it). Otherwise it stops, which frees its memory. The root layout
 * renders it once around every screen, with `<StockfishHost />` as `host`; it
 * takes the host as a prop so screens calling the hook don't import the engine.
 */
export function StockfishWhileNeeded({
  host,
  children,
}: {
  readonly host: ReactNode;
  readonly children: ReactNode;
}) {
  const { evaluationEngine, opponent } = useSettings();
  const [screens, setScreens] = useState(0);
  const needed = evaluationEngine === 'stockfish' || opponent === 'stockfish' || screens > 0;
  return (
    <DemandContext value={setScreens}>
      {children}
      {needed ? host : null}
    </DemandContext>
  );
}

/**
 * Keeps Stockfish running while `needed`, beside what the settings ask for.
 * A screen whose requests need it says so here rather than the root guessing
 * from routes.
 */
export function useNeedsStockfish(needed: boolean) {
  const setScreens = use(DemandContext);
  if (!setScreens) throw new Error('useNeedsStockfish must be used inside StockfishWhileNeeded');
  useEffect(() => {
    if (!needed) return;
    setScreens((screens) => screens + 1);
    return () => setScreens((screens) => screens - 1);
  }, [needed, setScreens]);
}
