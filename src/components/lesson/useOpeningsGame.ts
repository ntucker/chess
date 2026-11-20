import { useRouter } from 'expo-router';
import { type Dispatch, useDeferredValue, useEffect, useReducer, useState } from 'react';

import { type GameAction, gameReducer, type GameState, startGame } from '@/game/game';
import type { GameStore } from '@/game/useGame';
import type { VariationId } from '@/lesson/lesson';
import { lessonHref, lessonOf, sameLine, variationLine } from '@/lesson/openings';
import { LESSON_INDEX, type LessonId } from '@/resources/lesson';
import { useSettings, useSettingsDispatch } from '@/settings/SettingsProvider';
import type { Color } from '@/game/replay';

/**
 * Where an address starts: at the start, no moves; in a lesson, the line that
 * opens the variation it names, else the first line that picks the lesson.
 */
const startOf = (id: LessonId | undefined, variation?: VariationId) =>
  id === undefined
    ? []
    : (variationLine(LESSON_INDEX[id], variation) ?? LESSON_INDEX[id].lines[0].moves);

/** Where a history entry was, and the game the page had there when it left. */
interface Visit {
  readonly address?: LessonId;
  readonly variation?: VariationId;
  readonly game: GameState;
}

/**
 * The openings page's game store, kept in step with its address: `/`, the start,
 * or `/lesson/<id>`, the lesson `address` names. The game starts where the
 * address says. Picking a lesson moves to its address: from `/` it adds one
 * to the history, so the browser's Back returns to the start; from another
 * lesson it replaces that one, and so does `/` when a first move (or the
 * other side's start) picks no lesson, so no other entry's game is lost
 * (`dismissTo` would land on the entry underneath and take its game).
 * An address can also name one of its lesson's variations
 * (`/lesson/<id>?variation=<id>`, from the opening list), which starts the
 * game at the line that opens it; a move past that line drops it.
 *
 * Within one history entry (`entry`, its route's key) the address follows
 * the game, and an address the game didn't move to starts the game there
 * (a link opened in place). The addresses the game sent arrive in order,
 * maybe after it has moved on, so one it sent and that hasn't arrived yet
 * leaves the game where it is. Arriving at another entry resumes the game the
 * page had there, if the learner left it from where it still is, else starts
 * the entry's address; an entry the game's own pick added keeps the game.
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
export function useOpeningsGame(
  address: LessonId | undefined,
  variation: VariationId | undefined,
  entry: string | undefined,
) {
  const router = useRouter();
  const settings = useSettings();
  const settingsDispatch = useSettingsDispatch();
  // The side this page plays: the last lesson address's at once, which the
  // setting saves only after this render; otherwise the setting's.
  const [addressSide, setAddressSide] = useState(
    address === undefined ? undefined : LESSON_INDEX[address].side,
  );
  const side = addressSide ?? settings.side;
  const [game, dispatch] = useReducer(gameReducer, undefined, () =>
    startGame(startOf(address, variation)),
  );
  const { moves } = game;
  /** The lesson the game plays, named by the moves that pick it. */
  const picked = lessonOf(LESSON_INDEX, side, moves);
  // Where the page last caught up with. A change is checked during render,
  // so the page never shows the old game at the new address. `picks` are the
  // lessons the game has picked since, in order: each one the page may have
  // sent the address to, which can arrive after the game has moved on.
  const [synced, setSynced] = useState({ entry, address, variation, picks: [picked] });
  // Each history entry the page left, while the game was still at its address.
  const [left, setLeft] = useState<Partial<Record<string, Visit>>>({});
  const addressChanged = address !== synced.address || variation !== synced.variation;
  if (entry !== synced.entry || addressChanged) {
    let picks = [picked];
    if (address !== undefined && address !== synced.address) {
      setAddressSide(LESSON_INDEX[address].side);
    }
    // The game is at `id`'s address: it plays that lesson from its side
    // (lessons of both sides share moves), or at `/`, none from the page's.
    const isAt = (id?: LessonId) =>
      lessonOf(LESSON_INDEX, id === undefined ? side : LESSON_INDEX[id].side, moves) === id;
    if (entry !== synced.entry && synced.entry !== undefined) {
      const wasAt = isAt(synced.address);
      if (wasAt) {
        const leaving = { address: synced.address, variation: synced.variation, game };
        setLeft({ ...left, [synced.entry]: leaving });
      }
      const visit = entry === undefined ? undefined : left[entry];
      // A later push can reuse a key that Back left (keys follow the stack).
      const resumed =
        visit && visit.address === address && visit.variation === variation
          ? visit.game
          : undefined;
      // The game's own pick moved the address here: it stays.
      const pickMovedHere = !wasAt && isAt(address);
      if (!pickMovedHere) {
        dispatch({ type: 'newGame', moves: resumed?.moves ?? startOf(address, variation) });
        if (resumed) dispatch({ type: 'goto', ply: resumed.ply });
      }
    } else {
      // Within the entry: the address the game sent, or a link opened in place,
      // such as an Android deep link to the page already open. A link names
      // a variation (the game's own moves only ever drop one), or a lesson
      // the game isn't at and hasn't sent the address to since it last arrived.
      // (Or the entry's key arrived: then the address didn't change.)
      const sentAt = synced.picks.indexOf(address);
      const newVariation = variation !== undefined && addressChanged;
      if (!newVariation && sentAt >= 0) {
        // The ones sent after it are still on their way.
        picks = synced.picks.slice(sentAt);
      } else if (newVariation || !isAt(address)) {
        dispatch({ type: 'newGame', moves: startOf(address, variation) });
        picks = [address];
      }
    }
    setSynced({ entry, address, variation, picks });
  } else if (synced.picks.at(-1) !== picked) {
    // A lesson picked again is kept: the game may come back to it while the
    // address it sent there earlier is still on its way.
    setSynced({ ...synced, picks: [...synced.picks, picked] });
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
  // A move past the variation's line leaves it, so the address stops naming
  // it, and picking that variation again starts it afresh.
  const opens = address === undefined ? undefined : variationLine(LESSON_INDEX[address], variation);
  const leftVariation = opens !== undefined && picked === address && !sameLine(moves, opens);
  useEffect(() => {
    if (leftVariation) router.setParams({ variation: undefined });
  }, [leftVariation, router]);
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
