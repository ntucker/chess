/**
 * Traps from the study's two fixed formats: "Trap: <line> and Black is
 * losing." in any comment, and the chapter header's "Watch out: ...Nxd4?
 * loses material on moves 5 to 9", which names a move found in the chapter.
 */
import type { Chess } from 'chessops/chess';
import type { Color } from 'chessops/types';
import { opposite } from 'chessops/util';

import { SAN } from '@/game/replay';
import type { Line, Trap, Uci } from '@/lesson/lesson';

import { nearestMatch, placeSequence, type Found } from './line';
import { chapterMoves, mainLine, type Chapter, type StudyMove } from './study';
import { moveInWords, namedMoves, plainSan, plyOf, sideDoes } from './text';

const TRAP = /Trap:\s*(.+?)\s+and\s+(White|Black)\s+((?:is|gets)\s+[^.]+)\./g;

type TrapLine = Found & { readonly idea: Trap | Line };

/**
 * The "Trap:" lines in `move`'s comment; `learner` is the "you" of their text.
 * The side to move plays a trap's first move and falls for it, so a line that
 * starts with the winner's move (a sacrifice) is a line, not a trap.
 */
export function trapLines(move: StudyMove, learner: Color): TrapLine[] {
  return [...move.comment.matchAll(TRAP)].flatMap(([span, line, loser, result]): TrapLine[] => {
    const fell: Color = loser === 'White' ? 'white' : 'black';
    const verdict = trapVerdict(opposite(fell), result);
    const placed = verdict && placeSequence(move, namedMoves(line));
    if (!placed) return [];
    const { spot, ucis: moves } = placed;
    if (spot.pos.turn !== fell) {
      const outcome = sideDoes(fell, learner, result);
      const text = `${outcome[0].toUpperCase()}${outcome.slice(1)} at the end of this line.`;
      // A line has no "loses material" verdict: a sacrifice the study says mates is winning.
      const evaluation =
        verdict === 'losesMaterial' ? (`${opposite(fell)}Winning` as const) : verdict;
      return [{ spot, idea: { type: 'line', moves, verdict: evaluation }, text, original: span }];
    }
    return [
      {
        spot,
        idea: { type: 'trap', moves, verdict },
        text: trapText(spot.pos, moves[0], learner, result),
        original: span,
      },
    ];
  });
}

/**
 * A trap's note in words, since its play-through shows the moves: its
 * tempting move, and `result` ("is losing") for the side that plays it,
 * which is the side to move in `pos` (a trap's first move is the loser's).
 */
function trapText(pos: Chess, first: Uci, learner: Color, result: string): string {
  return `${moveInWords(pos, first)} falls into a trap: ${sideDoes(pos.turn, learner, result)}.`;
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
  String.raw`(\.\.\.)?(${SAN})\?\s+(loses material|drops a piece)\s+on moves?\s+(\d+)(?:\s+to\s+\d+)?`,
  'g',
);
/** How many plies of the study's continuation a watch-out trap shows. */
const TRAP_PLIES = 10;

/**
 * The traps a header's "Watch out:" line names: the chapter's move nearest
 * the first move number named, followed by the study's continuation. The
 * checker drops any that does not lose material.
 */
export function watchOuts(chapter: Chapter, watchOut: string, learner: Color): Found[] {
  return [...watchOut.matchAll(WATCH_OUT)].flatMap(([span, black, san, loses, number]) => {
    const side = black ? 'black' : 'white';
    const named = { san: plainSan(san), side, ply: plyOf(Number(number), !!black) } as const;
    const bait = nearestMatch(chapterMoves(chapter), named, named.ply);
    if (!bait) return [];
    const moves = [...mainLine(bait)].slice(0, TRAP_PLIES).map((move) => move.uci);
    const spot = bait.parent
      ? { move: bait.parent, pos: bait.parent.after }
      : { pos: chapter.start };
    const idea = { type: 'trap', moves, verdict: 'losesMaterial' } as const;
    const text = trapText(spot.pos, moves[0], learner, loses);
    return [{ spot, idea, text, original: `Watch out: ${span}.` }];
  });
}
