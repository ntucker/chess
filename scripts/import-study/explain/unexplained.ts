/**
 * Which book moves the lesson never explains: the learner is told to play
 * them, and nothing says why.
 */
import { noteShows, type Lesson, type Note, type PositionKey, type Uci } from '@/lesson/lesson';

import { bookReach, isGambitNote } from '../engineCheck';
import { allMoves } from '../transpositions';

/**
 * Why a book move counts as unexplained:
 * - `none`: no note on the move, nor on the position it reaches.
 * - `verdict`: only notes saying who is better ("You are slightly better.").
 * - `fragment`: only notes too short to say anything, or cut mid-sentence.
 */
export type Unexplained = 'none' | 'verdict' | 'fragment';

export interface UnexplainedMove {
  readonly key: PositionKey;
  readonly uci: Uci;
  readonly why: Unexplained;
}

/**
 * A short note that only says who stands better: "The position is equal.",
 * "White keeps a small edge here.", "You are comfortable here." Wider than
 * text.ts's verdicts, which the importer reads as evaluations: here a vague
 * "fine" or "comfortable" also leaves a move unexplained. ./notes.ts's VERDICT
 * refuses any such word in a generated note.
 */
const VERDICT =
  /^(?:the position is|everything is|it is|you are|you're|you stand|you keep|you get|you have|your position is|white is|black is|white keeps|black keeps|white has|black has|white stands|black stands)\b.*\b(?:equal|balanced|level|better|worse|winning|losing|fine|okay|ok|comfortable|edge|advantage|good|pleasant|dominant)\b/i;
const VERDICT_WORDS = 8;
/** Fewer words than this say nothing about a move. */
const FRAGMENT_WORDS = 3;

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

/** Why `note` explains nothing, or undefined when it says something about the position. */
export function bareNote(note: Note): Exclude<Unexplained, 'none'> | undefined {
  // Before the drawn test: a gambit note is Stockfish's verdict, whatever its ideas show.
  if (isGambitNote(note)) return 'verdict';
  if (noteShows(note.ideas) === 'drawn') return undefined;
  const text = note.text.trim();
  if (text.endsWith('…') || words(text) < FRAGMENT_WORDS) return 'fragment';
  if (words(text) <= VERDICT_WORDS && VERDICT.test(text)) return 'verdict';
  return undefined;
}

/** Why the book move whose notes and whose position's notes are `notes` is unexplained, if it is. */
function unexplainedBy(notes: readonly Note[]): Unexplained | undefined {
  if (notes.length === 0) return 'none';
  const bare = notes.map(bareNote);
  if (bare.some((why) => why === undefined)) return undefined;
  return bare.includes('verdict') ? 'verdict' : 'fragment';
}

/**
 * The book moves the learner meets (playing only book moves, against any
 * reply the guide shows) that nothing explains, in the lesson file's order.
 */
export function unexplainedMoves(lesson: Lesson): UnexplainedMove[] {
  const reached = bookReach(lesson);
  const found: UnexplainedMove[] = [];
  for (const { key, move, after } of allMoves(lesson)) {
    if (!move.book || !reached.has(key)) continue;
    const why = unexplainedBy([...(move.notes ?? []), ...(lesson.positions[after]?.notes ?? [])]);
    if (why) found.push({ key, uci: move.uci, why });
  }
  return found;
}

/** How many book moves the learner meets, and how many of them are unexplained, by why. */
export type Counts = { readonly book: number } & Readonly<Record<Unexplained, number>>;

/** `lesson`'s counts, with `moves` its unexplained moves. */
export function explainedCounts(
  lesson: Lesson,
  moves: readonly UnexplainedMove[] = unexplainedMoves(lesson),
): Counts {
  const reached = bookReach(lesson);
  let book = 0;
  for (const key of reached)
    book += lesson.positions[key]?.moves.filter((move) => move.book).length ?? 0;
  const counts = { book, none: 0, verdict: 0, fragment: 0 };
  for (const { why } of moves) counts[why]++;
  return counts;
}
