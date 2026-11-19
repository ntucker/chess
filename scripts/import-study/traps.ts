/**
 * Traps from the study's two fixed formats: "Trap: <line> and Black is
 * losing." in any comment, and the chapter header's "Watch out: ...Nxd4?
 * loses material on moves 5 to 9", which names a move found in the chapter.
 */
import type { Trap } from '@/lesson/lesson';

import { nearestMatch, placeSequence, type Found } from './line';
import { chapterMoves, mainLine, type Chapter, type StudyMove } from './study';
import { namedMoves, plainSan, SAN } from './text';

const TRAP = /Trap:\s*(.+?)\s+and\s+(White|Black)\s+(?:is|gets)\s+([^.]+)\./g;

/** The "Trap:" lines in `move`'s comment. */
export function trapLines(move: StudyMove): (Found & { idea: Trap })[] {
  return [...move.comment.matchAll(TRAP)].flatMap(([span, line, loser, outcome]) => {
    const verdict = trapVerdict(loser === 'White' ? 'black' : 'white', outcome);
    const placed = verdict && placeSequence(move, namedMoves(line));
    if (!placed) return [];
    return [{ spot: placed.spot, idea: { type: 'trap', moves: placed.ucis, verdict }, label: span }];
  });
}

/** "Black is losing" read as the winner's evaluation; "gets mated" as losing material. */
function trapVerdict(winner: 'white' | 'black', outcome: string): Trap['verdict'] | undefined {
  if (/mated/.test(outcome)) return 'losesMaterial';
  if (/losing|lost/.test(outcome)) return `${winner}Winning`;
  if (/clearly worse|big trouble|serious trouble/.test(outcome)) return `${winner}Clearly`;
  if (/worse/.test(outcome)) return `${winner}Slightly`;
  return undefined;
}

const WATCH_OUT = new RegExp(
  String.raw`(\.\.\.)?(${SAN})\?\s+(?:loses material|drops a piece)\s+on moves?\s+(\d+)(?:\s+to\s+\d+)?`,
  'g',
);
/** How many plies of the study's continuation a watch-out trap shows. */
const TRAP_PLIES = 10;

/**
 * The traps a header's "Watch out:" line names: the chapter's move nearest
 * the first move number named, followed by the study's continuation. The
 * checker drops any that does not lose material.
 */
export function watchOuts(chapter: Chapter, watchOut: string): Found[] {
  return [...watchOut.matchAll(WATCH_OUT)].flatMap(([span, black, san, number]) => {
    const side = black ? 'black' : 'white';
    const named = { san: plainSan(san), side, ply: 2 * Number(number) - (black ? 0 : 1) } as const;
    const bait = nearestMatch(chapterMoves(chapter), named, named.ply);
    if (!bait) return [];
    const moves = [...mainLine(bait)].slice(0, TRAP_PLIES).map((move) => move.uci);
    const spot = bait.parent ? { move: bait.parent, pos: bait.parent.after } : { pos: chapter.start };
    return [{ spot, idea: { type: 'trap', moves, verdict: 'losesMaterial' }, label: `Watch out: ${span}.` }];
  });
}
