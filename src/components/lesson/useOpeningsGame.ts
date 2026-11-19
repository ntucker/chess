import { useRouter } from 'expo-router';
import { useEffect, useReducer, useState } from 'react';

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
 * The openings page's game, kept in step with its address: `/`, the start,
 * or `/lesson/<id>`, the lesson `address` names. The game starts where the
 * address says. Picking a lesson moves to its address: from `/` it adds one
 * to the history, from another lesson it replaces that one, so the browser's
 * Back returns to the start. Going Back or Forward to an address the game
 * isn't in starts that address's game; the address catching up with a pick
 * keeps the game.
 */
export function useOpeningsGame(address: LessonId | undefined) {
  const router = useRouter();
  const store: GameStore = useReducer(gameReducer, address, (id) => startGame(startOf(id)));
  const [{ moves }, dispatch] = store;
  /** The lesson the game plays, named by its first move. */
  const picked = lessonOf(LESSON_INDEX, moves);
  const [seen, setSeen] = useState(address);
  if (address !== seen) {
    setSeen(address);
    if (address !== picked) dispatch({ type: 'newGame', moves: startOf(address) });
  }
  useEffect(() => {
    if (picked === undefined || picked === address) return;
    if (address === undefined) router.push(lessonHref(picked));
    else router.replace(lessonHref(picked));
  }, [picked, address, router]);
  return { store, picked };
}
