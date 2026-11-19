import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  use,
  useEffect,
  useState,
} from "react";

import { useSettings } from "@/settings/SettingsProvider";

import { StockfishHost } from "./StockfishHost";

/** Counts the screens that need Stockfish now. */
const DemandContext = createContext<
  Dispatch<SetStateAction<number>> | undefined
>(undefined);

/**
 * Runs Stockfish while the evaluation bar or the opponent uses it, or a
 * screen calls `useNeedsStockfish(true)` (a lesson, which always labels moves
 * with it). Otherwise it stops, which frees its memory. The root layout
 * renders it once around every screen.
 */
export function StockfishWhileNeeded({
  children,
}: {
  readonly children: ReactNode;
}) {
  const { evaluationEngine, opponent } = useSettings();
  const [screens, setScreens] = useState(0);
  const needed =
    evaluationEngine === "stockfish" || opponent === "stockfish" || screens > 0;
  return (
    <DemandContext value={setScreens}>
      {children}
      {needed ? <StockfishHost /> : null}
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
  if (!setScreens)
    throw new Error("useNeedsStockfish is used inside StockfishWhileNeeded");
  useEffect(() => {
    if (!needed) return;
    setScreens((screens) => screens + 1);
    return () => setScreens((screens) => screens - 1);
  }, [needed, setScreens]);
}
