import { createContext, type Dispatch, type SetStateAction, use, useEffect } from 'react';

/** Counts the screens that need Stockfish now; the root layout runs it while any do. */
export const StockfishDemandContext = createContext<
  Dispatch<SetStateAction<number>> | undefined
>(undefined);

/**
 * Keeps Stockfish running while `needed`, beside what the settings ask for
 * (src/app/_layout.tsx). A screen whose requests need it says so here rather
 * than the root guessing from routes.
 */
export function useStockfish(needed: boolean) {
  const setDemand = use(StockfishDemandContext);
  if (!setDemand) throw new Error('useStockfish must be used inside the root layout');
  useEffect(() => {
    if (!needed) return;
    setDemand((screens) => screens + 1);
    return () => setDemand((screens) => screens - 1);
  }, [needed, setDemand]);
}
