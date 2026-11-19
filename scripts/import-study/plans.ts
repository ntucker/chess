/**
 * Plans from lists of Black moves in a comment, like "...Nc6, ...Bg4 and
 * ...e6": one route per move, played in order on one board while the other
 * side passes.
 */
import type { SquareName } from 'chessops/types';

import { sanToUci } from '@/game/replay';
import { withTurn } from '@/lesson/check';
import type { Route } from '@/lesson/lesson';

import { findOnLine, playedBy, type Found, type Spot } from './line';
import { played, type StudyMove } from './study';
import { namedMoves, plainSan, SAN, sentenceEnds } from './text';

const LISTED = new RegExp(String.raw`(?<![\w.\d])\.\.\.(${SAN})(?![\w-])`, 'g');
/** What may stand between two moves of one list. */
const SEPARATOR =
  /^\s*[,;]?\s*(?:and\s+then\s+|and\s+|then\s+|followed\s+by\s+)?(?:plays?\s+)?(?:(?:break|play|follow\s+up)\s+with\s+)?(?:the\s+)?$/;

/**
 * The plans listed in `text`, a comment on `move`. A list belongs after the
 * move the text names just before it ("After 9.Nf3 ...", or in a chapter
 * header any numbered move), else after `move`. A list naming a move Black
 * already played is a recap, not a plan, and is dropped.
 */
export function planLists(move: StudyMove, text: string, header = false): Found[] {
  return moveLists(text).flatMap(({ index, end, sans }) => {
    const spot = planSpot(move, text.slice(sentenceStart(text, index), index), header);
    if (!spot) return [];
    const blackMoves = playedBy(spot, 'black');
    if (sans.some((san) => blackMoves.has(san))) return [];
    const routes = planRoutes(spot, sans);
    return routes ? [{ spot, idea: { type: 'plan', side: 'black', routes }, label: text.slice(index, end) }] : [];
  });
}

interface MoveList {
  readonly index: number;
  readonly end: number;
  readonly sans: readonly string[];
}

/** Runs of two or more `...` moves in `text`, with where each starts and ends. */
function moveLists(text: string): MoveList[] {
  const lists: MoveList[] = [];
  let current: RegExpMatchArray[] = [];
  const close = () => {
    if (current.length >= 2) {
      const last = current.at(-1)!;
      lists.push({
        index: current[0].index!,
        end: last.index! + last[0].length,
        sans: current.map((m) => plainSan(m[1])),
      });
    }
  };
  for (const match of text.matchAll(LISTED)) {
    const previous = current.at(-1);
    if (previous && SEPARATOR.test(text.slice(previous.index! + previous[0].length, match.index))) {
      current.push(match);
    } else {
      close();
      current = [match];
    }
  }
  close();
  return lists;
}

function sentenceStart(text: string, index: number): number {
  const ended = sentenceEnds(text).filter((end) => end <= index);
  return Math.max(ended.at(-1) ?? 0, text.lastIndexOf('\n', index) + 1);
}

/** Where a plan applies, from the text of its sentence before the list. */
function planSpot(move: StudyMove, before: string, header: boolean): Spot | undefined {
  const anchor = header ? before : before.match(/After\s+(.+)$/)?.[1];
  const named = namedMoves(anchor ?? '')
    .filter((m) => m.ply)
    .at(-1);
  if (!named) return header ? { pos: move.before } : { move, pos: move.after };
  const found = findOnLine(move, named);
  return found && { move: found, pos: found.after };
}

/** The routes of Black's moves `sans` from `spot`, or undefined if one cannot be played. */
function planRoutes(spot: Spot, sans: readonly string[]): Route[] | undefined {
  let board = spot.pos;
  const routes: Route[] = [];
  for (const san of sans) {
    board = withTurn(board, 'black');
    const uci = sanToUci(board, san);
    if (!uci) return undefined;
    routes.push({ from: uci.slice(0, 2) as SquareName, to: uci.slice(2, 4) as SquareName });
    board = played(board, uci);
  }
  return routes;
}
