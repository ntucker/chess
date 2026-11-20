import { useRouter } from 'expo-router';
import { type Dispatch, useDeferredValue, useEffect, useReducer, useState } from 'react';

import { type GameAction, gameReducer, startGame } from '@/game/game';
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
 * The store holds the game as the page shows it (`useDeferredValue`): while
 * the page's render of a newer game waits, the page keeps the older one.
 * That lasts until the lesson the newer game plays has loaded, or for one
 * render after any other change. So picking an opening, or going Back or
 * Forward to one, keeps the page on screen rather than a placeholder, while
 * the address moves at once. The store's dispatch acts on the newer game, so
 * while the page is `behind` it drops the learner's moves and steps.
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
  const behind = shown !== game;
  const held: Dispatch<GameAction> = (action) => {
    if (!isInput(action)) dispatch(action);
  };
  const store: GameStore = [shown, behind ? held : dispatch];
  const lesson = lessonOf(LESSON_INDEX, shown.moves);
  return {
    store,
    /** The lesson the page's game plays. */
    lesson,
    /** The page shows a game the store has moved on from. */
    behind,
    /** The game has moved on to a lesson the page doesn't show yet: it's loading. */
    pending: lesson !== picked,
  };
}

/**
 * What the learner does on the board, made on the position the page shows,
 * so wrong on a newer game. An opponent's reply names the position it
 * answers, and a retry only asks the newer game's opponent again, so neither
 * is held.
 */
const isInput = (action: GameAction) => action.type === 'move' || action.type === 'goto';
