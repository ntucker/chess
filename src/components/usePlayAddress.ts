import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useReducer, useState } from 'react';

import { useInBrowser } from '@/components/BrowserOnly';
import { gameReducer, startGame } from '@/game/game';
import { type Color, COLORS } from '@/game/replay';
import { sameLine } from '@/lesson/openings';
import { addressMoves } from '@/review/address';

/** The free-game page's params, as the URL has them. A type, as `useLocalSearchParams` takes no interface. */
type Params = { readonly moves?: string; readonly side?: string };

/**
 * The free-game page's game and side, kept in step with its address, which
 * can start the game having played moves, from a side
 * (`/play?moves=e2e4 e7e5&side=black`): the review's "Play on from here"
 * (`playOnHref`), which may land on the page already open. A move past those
 * moves, or a new game, drops them from the address, so the same link starts
 * its game afresh. The side counts only with moves. Without them the game
 * starts empty, as White.
 */
export function usePlayAddress() {
  const router = useRouter();
  const params = useLocalSearchParams<Params>();
  // The static export knows no address: the first render in the browser
  // starts empty as it did, and the address's game follows at once.
  const address: Params = useInBrowser() ? params : {};
  const named = addressMoves(address.moves);
  // The side of the game on the board, which the next game keeps.
  const [side, setSide] = useState<Color>(sideOf(address.side) ?? 'white');
  const store = useReducer(gameReducer, named, startGame);
  // An address that names moves starts their game; one that names none is
  // the page's own drop. Checked during render.
  const [startedAt, setStartedAt] = useState(address.moves);
  if (address.moves !== startedAt) {
    setStartedAt(address.moves);
    if (address.moves !== undefined) {
      const addressSide = sideOf(address.side);
      if (addressSide) setSide(addressSide);
      store[1]({ type: 'newGame', moves: named });
    }
  }
  const left = address.moves !== undefined && !sameLine(store[0].moves, named);
  // The address is outside React, so the drop goes out in an effect.
  useEffect(() => {
    if (left) router.setParams({ moves: undefined, side: undefined });
  }, [left, router]);
  return { store, side, setSide };
}

/** A side as the address names it, if it names one. */
const sideOf = (side?: string) => COLORS.find((color) => color === side);
