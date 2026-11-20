import { useRouter } from 'expo-router';
import { type Dispatch, useDeferredValue, useEffect, useReducer, useState } from 'react';

import { type GameAction, gameReducer, startGame } from '@/game/game';
import type { GameStore } from '@/game/useGame';
import { lessonOf } from '@/lesson/openings';
import { LESSON_INDEX, type LessonId } from '@/resources/lesson';
import { useSettings, useSettingsDispatch } from '@/settings/SettingsProvider';
import type { Color } from '@/game/replay';

/** Where a lesson starts: the first line that picks it played; at the start, none. */
const startOf = (id: LessonId | undefined) =>
  id === undefined ? [] : LESSON_INDEX[id].lines[0].moves;

/** A lesson's address, without a trailing slash (GitHub Pages 404s on one). */
const lessonHref = (id: LessonId) => `/lesson/${id}` as const;

/**
 * The openings page's game store, kept in step with its address: `/`, the start,
 * or `/lesson/<id>`, the lesson `address` names. The game starts where the
 * address says. Picking a lesson moves to its address: from `/` it adds one
 * to the history, from another lesson it replaces that one, so the browser's
 * Back returns to the start. A game that picks no lesson (a first move that
 * picks none, or a side swapped) replaces its address with `/`, leaving no
 * Forward to a lesson it left. Going Back or Forward to an address the game isn't in starts that
 * address's game; the address catching up with a pick keeps the game.
 *
 * The side is the lesson address's, which the `side` setting saves, so the
 * start, and a reload, show the side last played; at the start it is the
 * setting. Choosing the other side saves it and starts again from the start.
 *
 * The store holds the game as the page shows it: when the game moves to
 * another lesson, the page keeps the older game until that lesson has loaded
 * (`useDeferredValue`); the start loads nothing, so it shows at once. So
 * picking an opening, or going Back or Forward to one, keeps the page on
 * screen rather than a placeholder, while the address moves at once. The
 * store's dispatch acts on the newer game, so while the lesson is `pending`
 * it drops the learner's moves and steps.
 */
export function useOpeningsGame(address: LessonId | undefined) {
  const router = useRouter();
  const settings = useSettings();
  const settingsDispatch = useSettingsDispatch();
  // The side this page plays: the last lesson address's at once, which the
  // setting saves only after this render; otherwise the setting's.
  const [addressSide, setAddressSide] = useState(
    address === undefined ? undefined : LESSON_INDEX[address].side,
  );
  const side = addressSide ?? settings.side;
  const [game, dispatch] = useReducer(gameReducer, address, (id) => startGame(startOf(id)));
  const { moves } = game;
  /** The lesson the game plays, named by the moves that pick it. */
  const picked = lessonOf(LESSON_INDEX, side, moves);
  // The address the game last caught up with. A new one is checked during
  // render, so the page never shows the old game at the new address.
  const [synced, setSynced] = useState(address);
  if (address !== synced) {
    setSynced(address);
    if (address !== undefined) setAddressSide(LESSON_INDEX[address].side);
    if (address !== picked) dispatch({ type: 'newGame', moves: startOf(address) });
  }
  useEffect(() => {
    if (address !== undefined) {
      settingsDispatch({ type: 'chosen', choice: { side: LESSON_INDEX[address].side } });
    }
  }, [address, settingsDispatch]);
  // The address is outside React, so it follows the game in an effect.
  useEffect(() => {
    if (picked === address) return;
    if (picked === undefined) router.replace('/');
    else if (address === undefined) router.push(lessonHref(picked));
    else router.replace(lessonHref(picked));
  }, [picked, address, router]);
  // Only a change of lesson waits: within one, the page shows each move in
  // its first render (the deferred one that follows shows the same game), so
  // the board never shows a move late or stops taking moves meanwhile.
  // The start loads nothing, so a game that leaves its lesson for it (a side
  // swapped, or Back to `/`) shows at once.
  const deferred = useDeferredValue(game);
  const shownSide = useDeferredValue(side);
  const shownLesson = lessonOf(LESSON_INDEX, shownSide, deferred.moves);
  const pending = picked !== undefined && shownLesson !== picked;
  const held: Dispatch<GameAction> = (action) => {
    if (!isInput(action)) dispatch(action);
  };
  const store: GameStore = pending ? [deferred, held] : [game, dispatch];
  return {
    store,
    /** The lesson the page's game plays. */
    lesson: pending ? shownLesson : picked,
    /** The side the page's game is played from. */
    side: pending ? shownSide : side,
    /** The learner plays as `next` from now on: its start, unless that is the side already. */
    playAs: (next: Color) => {
      if (next === side) return;
      // The setting holds it now; `addressSide` holds an address's side until saved.
      setAddressSide(undefined);
      settingsDispatch({ type: 'chosen', choice: { side: next } });
      dispatch({ type: 'newGame', moves: [] });
    },
    /**
     * The game has moved on to a lesson the page doesn't show yet: it's
     * loading, and the page offers no moves.
     */
    pending,
  };
}

/**
 * What the learner does on the board, made on the position the page shows:
 * applied to a newer game, it would act on another position. An opponent's
 * reply names the position it answers, and a retry only asks the newer
 * game's opponent again, so neither is held.
 */
const isInput = (action: GameAction) => action.type === 'move' || action.type === 'goto';
