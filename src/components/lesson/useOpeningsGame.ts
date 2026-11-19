import { useRouter } from 'expo-router';
import { useDeferredValue, useEffect, useReducer, useState } from 'react';

import { gameReducer, startGame } from '@/game/game';
import type { GameStore } from '@/game/useGame';
import { lessonOf } from '@/lesson/openings';
import { LESSON_INDEX, type LessonId } from '@/resources/lesson';

/** Where a lesson starts: its main-line first move played; at the start, none. */
const startOf = (id: LessonId | undefined) =>
  id === undefined ? [] : LESSON_INDEX[id].firstMoves.slice(0, 1);

/** A lesson's address, without a trailing slash (GitHub Pages 404s on one). */
const lessonHref = (id: LessonId) => `/lesson/${id}` as const;

/**
 * The openings page's game store, kept in step with its address: `/`, the start,
 * or `/lesson/<id>`, the lesson `address` names. The game starts where the
 * address says. Picking a lesson moves to its address: from `/` it adds one
 * to the history, from another lesson it replaces that one, so the browser's
 * Back returns to the start. A first move that picks no lesson returns to
 * `/`. Going Back or Forward to an address the game isn't in starts that
 * address's game; the address catching up with a pick keeps the game.
 *
 * The store holds the game as the page shows it: as it stood until the
 * lesson it now plays has loaded (`useDeferredValue`), so picking an opening,
 * or going Back or Forward to one, keeps the page on screen rather than a
 * placeholder, while the address moves at once. `pending` while it lags.
 */
export function useOpeningsGame(address: LessonId | undefined) {
  const router = useRouter();
  const [game, dispatch] = useReducer(gameReducer, address, (id) => startGame(startOf(id)));
  const { moves } = game;
  /** The lesson the game plays, named by its first move. */
  const picked = lessonOf(LESSON_INDEX, moves);
  // The address the game last caught up with. A new one is checked during
  // render, so the page never shows the old game at the new address.
  const [synced, setSynced] = useState(address);
  if (address !== synced) {
    setSynced(address);
    if (address !== picked) dispatch({ type: 'newGame', moves: startOf(address) });
  }
  // The address is outside React, so it follows the game in an effect.
  useEffect(() => {
    if (picked === address) return;
    if (picked === undefined) router.dismissTo('/');
    else if (address === undefined) router.push(lessonHref(picked));
    else router.replace(lessonHref(picked));
  }, [picked, address, router]);
  const shown = useDeferredValue(game);
  const store: GameStore = [shown, dispatch];
  return { store, pending: shown !== game };
}
