import { useRouter } from 'expo-router';
import { type Dispatch, use, useDeferredValue, useEffect, useReducer, useState } from 'react';

import { type GameAction, gameReducer, type GameState, startGame } from '@/game/game';
import type { GameStore } from '@/game/useGame';
import type { VariationId } from '@/lesson/lesson';
import { AT_ONCE } from '@/components/navigation';
import { lessonHref, type LessonIndex, lessonOf, sameLine, variationLine } from '@/lesson/openings';
import { LessonIndexContext, type LessonId } from '@/resources/lesson';
import { useSettings, useSettingsDispatch } from '@/settings/SettingsProvider';
import type { Color } from '@/game/replay';

/**
 * Where an address starts: at the start, no moves; in a lesson, the line that
 * opens the variation it names, else the first line that picks the lesson.
 */
const startOf = (
  index: LessonIndex<LessonId>,
  id: LessonId | undefined,
  variation?: VariationId,
) => (id === undefined ? [] : (variationLine(index[id], variation) ?? index[id].lines[0].moves));

/** An address: `/` or a lesson, and a variation of it. */
interface Address {
  readonly address?: LessonId;
  readonly variation?: VariationId;
}
const sameAddress = (a: Address, b: Address) =>
  a.address === b.address && a.variation === b.variation;

/**
 * An address the page sent to follow the game: the lesson it picked, added
 * to the history from `/`; in place of another address, that lesson or `/`;
 * or the address's variation dropped.
 */
type Send =
  | { readonly how: 'push'; readonly address: LessonId; readonly variation?: undefined }
  | (Address & { readonly how: 'replace' | 'drop' });

/** The address the page last caught up with, and its sends on their way, in order. */
interface Synced extends Address {
  readonly entry?: string;
  readonly sent: readonly Send[];
}

/** Where a history entry was, and the game the page had there when it left, from its side. */
interface Visit extends Address {
  readonly game: GameState;
  readonly side: Color;
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
 * The page keeps each address it sends until it arrives, in order, maybe
 * after the game has moved on; its own keeps the game where it is. Any other
 * address is Back, Forward or a link. In another history entry (`entry`, its
 * route's key: the router makes a new one for a push or a replace) it
 * resumes the game the page had there, if the learner left it from where it
 * still is, else starts the entry's address. In the same entry (only a
 * change of variation keeps it, as a link to the page already open does,
 * such as an Android deep link) it starts the address.
 *
 * The side is the lesson address's, or at a start resumed by Back or Forward
 * the side its game was played from; the `side` setting saves it, so the
 * start, and a reload, show the side last played. At a fresh start it is the
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
  const index = use(LessonIndexContext);
  const settings = useSettings();
  const settingsDispatch = useSettingsDispatch();
  // The side this page plays: the last lesson address's, or a resumed game's,
  // at once, which the setting saves only after this render; otherwise the setting's.
  const [addressSide, setAddressSide] = useState(
    address === undefined ? undefined : index[address].side,
  );
  const side = addressSide ?? settings.side;
  const [game, dispatch] = useReducer(gameReducer, undefined, () =>
    startGame(startOf(index, address, variation)),
  );
  const { moves } = game;
  /** The lesson the game plays, named by the moves that pick it. */
  const picked = lessonOf(index, side, moves);
  // Checked during render, so the page never shows the old game at the new address.
  const [synced, setSynced] = useState<Synced>({ entry, address, variation, sent: [] });
  // Each history entry the page left, while the game was still at its address.
  const [left, setLeft] = useState<Partial<Record<string, Visit>>>({});
  if (entry !== synced.entry || address !== synced.address || variation !== synced.variation) {
    if (address !== undefined && address !== synced.address) {
      setAddressSide(index[address].side);
    }
    // One of the page's own sends arriving, maybe after the game has moved on.
    const arrivedAt = synced.sent.findIndex((sent) => sameAddress(sent, { address, variation }));
    let sent: readonly Send[] = [];
    if (arrivedAt >= 0) {
      sent = synced.sent.slice(arrivedAt + 1);
    } else if (synced.entry === undefined && sameAddress(synced, { address, variation })) {
      // The entry's key arrived.
      sent = synced.sent;
    } else if (entry !== synced.entry && synced.entry !== undefined) {
      // Back, Forward, or a link: resume the game the entry had, else start it.
      // The game is at `id`'s address: it plays that lesson from its side
      // (lessons of both sides share moves), or at `/`, none from the page's.
      const isAt = (id?: LessonId) =>
        (id === undefined ? picked : lessonOf(index, index[id].side, moves)) === id;
      if (isAt(synced.address)) {
        const leaving = { address: synced.address, variation: synced.variation, game, side };
        setLeft({ ...left, [synced.entry]: leaving });
      }
      const visit = entry === undefined ? undefined : left[entry];
      // A later push can reuse a key that Back left (keys follow the stack).
      const resumed = visit && sameAddress(visit, { address, variation }) ? visit : undefined;
      dispatch({
        type: 'newGame',
        moves: resumed?.game.moves ?? startOf(index, address, variation),
      });
      if (resumed) {
        dispatch({ type: 'goto', ply: resumed.game.ply });
        // The side the game was played from: at `/`, maybe not the setting's.
        setAddressSide(resumed.side);
      }
    } else {
      // A link to the page already open.
      dispatch({ type: 'newGame', moves: startOf(index, address, variation) });
    }
    setSynced({ entry, address, variation, sent });
  } else {
    // Once the sends on their way arrive, the address is the last one's.
    const next = nextSend(index, synced.sent.at(-1) ?? synced, picked, moves);
    if (next) setSynced({ ...synced, sent: [...synced.sent, next] });
  }
  // Saves the side whenever an address or a resumed game sets it, not on
  // each address: a lesson of the same side leaves the setting as it is.
  useEffect(() => {
    if (addressSide !== undefined)
      settingsDispatch({ type: 'chosen', choice: { side: addressSide } });
  }, [addressSide, settingsDispatch]);
  // The address is outside React, so the page's sends go out in an effect.
  const sending = synced.sent.at(-1);
  useEffect(() => {
    if (sending?.how === 'drop') router.setParams({ variation: undefined });
    else if (sending?.how === 'push') router.push(lessonHref(sending.address), AT_ONCE);
    else if (sending)
      router.replace(sending.address === undefined ? '/' : lessonHref(sending.address), AT_ONCE);
  }, [sending, router]);
  // Only a change of lesson waits: within one, the page shows each move in
  // its first render (the deferred one that follows shows the same game), so
  // the board never shows a move late or stops taking moves meanwhile.
  // The start loads nothing, so a game that leaves its lesson for it (a side
  // swapped, or Back to `/`) shows at once.
  const deferred = useDeferredValue(game);
  const shownSide = useDeferredValue(side);
  const shownLesson = lessonOf(index, shownSide, deferred.moves);
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
 * The address to send so it follows the game, from the one it is bound for:
 * the lesson the game picks, or the variation dropped once a move leaves its
 * line (so picking that variation again starts it afresh).
 */
function nextSend(
  index: LessonIndex<LessonId>,
  bound: Address,
  picked: LessonId | undefined,
  moves: readonly string[],
): Send | undefined {
  if (picked !== bound.address) {
    return bound.address === undefined && picked !== undefined
      ? { address: picked, how: 'push' }
      : { address: picked, how: 'replace' };
  }
  if (bound.address === undefined) return undefined;
  const opens = variationLine(index[bound.address], bound.variation);
  return opens !== undefined && !sameLine(moves, opens)
    ? { address: picked, how: 'drop' }
    : undefined;
}

/**
 * What the learner does on the board, made on the position the page shows:
 * applied to a newer game, it would act on another position. An opponent's
 * reply names the position it answers, and a retry only asks the newer
 * game's opponent again, so neither is held.
 */
const isInput = (action: GameAction) => action.type === 'move' || action.type === 'goto';
