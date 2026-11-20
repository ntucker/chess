/**
 * The unexplained book moves as the model reads them: the move on its board,
 * what the guide says around it, and what Stockfish makes of it, so the idea
 * the model writes holds on the board and agrees with the guide.
 */
import type { Chess } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import type { Color } from 'chessops/types';

import type { Evaluation } from '@/evaluation/evaluation';
import { playLine, positionKey } from '@/game/replay';
import type { Lesson, Note, PositionKey, Uci } from '@/lesson/lesson';

import { hash, legalMoves, pieces } from '../convert/comments';
import { linesTo, san, sans, startOf, type Evaluate } from '../engineCheck';
import { played } from '../study';
import type { UnexplainedMove } from './unexplained';

/** One unexplained book move as the model reads it. */
export interface BookMove {
  /** Stable across imports: the position and the move. */
  readonly id: string;
  /** Every move from the start, ending with this one, like `1.e4 c6 2.d4 d5 3.e5 Bf5`. */
  readonly line: string;
  readonly move: string;
  readonly fenBefore: string;
  readonly fenAfter: string;
  readonly piecesAfter: Readonly<Record<Color, string>>;
  /** Every legal move for the opponent after the move, in SAN. */
  readonly legalAfter: readonly string[];
  /** The variation the move's position belongs to. */
  readonly variation: string;
  /** The guide's other moves for the learner here; `book: false` ones it warns against. */
  readonly alternatives: readonly { readonly move: string; readonly book: boolean }[];
  readonly engine: {
    /** Stockfish's move for the learner here, in SAN: often this one. */
    readonly best?: string;
    /** How the position stands after the move for the learner, in pawns or as a mate. */
    readonly forYou: string;
    /** The opponent's best answer to the move, in SAN. */
    readonly reply?: string;
  };
  /** The guide's nearest note on an earlier move or position of the line. */
  readonly previousNote?: string;
  /** The guide's moves for the opponent next, each with its first note when it has one. */
  readonly replies: readonly { readonly move: string; readonly note?: string }[];
  /** Short notes the lesson already shows with this move (verdicts): never repeated. */
  readonly notesHere: readonly string[];
  /** Only when asked again: the notes written before and why they were refused. */
  readonly refused?: readonly { readonly text: string; readonly why: string }[];
}

/**
 * What an answer for `item` is stored by: the move, what the guide says around
 * it (so the model is asked again when that changes, and its note keeps
 * agreeing with the guide), and on a retry what was refused. Not Stockfish's
 * numbers, which differ between machines, so `--no-model` finds the same
 * answers anywhere. The guards still read this machine's Stockfish reply
 * (./notes.ts), as the book filling before them does.
 */
export const itemKey = ({
  fenBefore,
  move,
  refused,
  alternatives,
  previousNote,
  replies,
  notesHere,
}: BookMove) => [fenBefore, move, refused, { alternatives, previousNote, replies, notesHere }];

/** `moves` as the model reads them, with Stockfish's view of each, one after another. */
export async function bookMoveItems(
  lesson: Lesson,
  moves: readonly UnexplainedMove[],
  evaluate: Evaluate,
): Promise<{ readonly move: UnexplainedMove; readonly item: BookMove }[]> {
  const lines = linesTo(lesson);
  const items = [];
  for (const move of moves) {
    const at = lines.get(move.key);
    if (at)
      items.push({ move, item: await bookMoveItem(lesson, at.line, at.pos, move.uci, evaluate) });
  }
  return items;
}

async function bookMoveItem(
  lesson: Lesson,
  line: readonly Uci[],
  before: Chess,
  uci: Uci,
  evaluate: Evaluate,
): Promise<BookMove> {
  const key = positionKey(before);
  const position = lesson.positions[key];
  const after = played(before, uci);
  const afterKey = positionKey(after);
  const next = lesson.positions[afterKey];
  const fenBefore = makeFen(before.toSetup());
  const now = await evaluate(line, key);
  const then = await evaluate([...line, uci], afterKey);
  const own = position.moves.find((move) => move.uci === uci);
  const notesHere = [...(own?.notes ?? []), ...(next?.notes ?? [])].map(({ text }) => text);
  const previousNote = earlierNote(lesson, line);
  return {
    id: hash(`${fenBefore} ${uci}`),
    line: sans(lesson, [...line, uci]),
    move: san(before, uci),
    fenBefore,
    fenAfter: makeFen(after.toSetup()),
    piecesAfter: pieces(after),
    legalAfter: legalMoves(after),
    variation: lesson.variations[position.variation].name,
    alternatives: position.moves
      .filter((move) => move.uci !== uci)
      .map((move) => ({ move: san(before, move.uci), book: move.book === true })),
    engine: {
      ...(now.best && { best: san(before, now.best) }),
      forYou: standing(then, lesson.side),
      ...(then.best && { reply: san(after, then.best) }),
    },
    ...(previousNote && { previousNote }),
    replies: (next?.moves ?? []).map((move) => ({
      move: san(after, move.uci),
      ...(move.notes?.[0] && { note: move.notes[0].text }),
    })),
    notesHere,
  };
}

/** The guide's nearest note on `line`, from its end back: on a move, or on the position it reached. */
function earlierNote(lesson: Lesson, line: readonly Uci[]): string | undefined {
  const keys = Array.from(playLine(line, startOf(lesson)), ({ key }) => key);
  for (let i = line.length - 1; i >= 0; i--) {
    const reached = lesson.positions[keys[i + 1]]?.notes;
    const move = lesson.positions[keys[i]]?.moves.find(
      (candidate) => candidate.uci === line[i],
    )?.notes;
    const note: Note | undefined = reached?.[0] ?? move?.[0];
    if (note) return note.text;
  }
  return undefined;
}

/** How `evaluation` stands for `side`: "+0.4", "-1.2", "you mate in 3", "they mate in 2", "you mate". */
function standing({ pawns, mate }: Evaluation, side: Color): string {
  const sign = side === 'white' ? 1 : -1;
  // After the learner's move only the opponent can be mated.
  if (mate === 0) return 'you mate';
  if (mate !== undefined) return `${mate * sign > 0 ? 'you' : 'they'} mate in ${Math.abs(mate)}`;
  const forYou = Math.round(pawns * sign * 10) / 10;
  return `${forYou > 0 ? '+' : ''}${forYou.toFixed(1)}`;
}
