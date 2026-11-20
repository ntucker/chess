/**
 * Checks a lesson against an engine before it is written, so that a lesson
 * merged from several guides never recommends a bad move or shows a verdict
 * the engine contradicts:
 *
 * - A learner's book move the engine calls a mistake or a blunder (the app's
 *   own move labels, analysis/quality.ts) stops being a book move, and so does
 *   every book move only reachable through it.
 * - A note goes when its verdict is two or more steps from the engine's on
 *   the scale = ⩲ ± +- (an evaluation badge, or where a line or trap ends), or
 *   when its trap's first move is not an error at all.
 *
 * Each change is reported, so a person can read what the engine overruled.
 */
import { Chess } from 'chessops/chess';
import { makeSan } from 'chessops/san';
import { parseUci } from 'chessops/util';

import type { Evaluation } from '@/evaluation/evaluation';
import { classifyMove } from '@/analysis/quality';
import { parsePosition, positionKey } from '@/game/replay';
import type {
  Evaluation as Verdict,
  Idea,
  Lesson,
  LessonMove,
  LessonPosition,
  Note,
  PositionKey,
  Uci,
} from '@/lesson/lesson';

/** The engine's evaluation of the position after `line` from the lesson's start, reached at `key`. */
export type Evaluate = (line: readonly Uci[], key: PositionKey) => Promise<Evaluation>;

export interface EngineReport {
  /** Book moves the engine overruled, with the line before each, in SAN. */
  readonly unbooked: readonly { line: string; move: string; quality: string }[];
  /** Book moves left that no book path reaches any more. */
  readonly unreachable: readonly { line: string; move: string }[];
  /** Notes dropped, where they were and why. */
  readonly dropped: readonly { line: string; text: string; reason: string }[];
}

/** `lesson` with what `evaluate` overrules taken out, and what was taken. */
export async function engineCheck(
  lesson: Lesson,
  evaluate: Evaluate,
): Promise<{ lesson: Lesson; report: EngineReport }> {
  const lines = linesTo(lesson);
  const cache = new Map<PositionKey, Promise<Evaluation>>();
  const evaluation = (line: readonly Uci[], pos: Chess) => {
    const key = positionKey(pos);
    if (!cache.has(key)) cache.set(key, evaluate(line, key));
    return cache.get(key)!;
  };
  const report = {
    unbooked: [] as { line: string; move: string; quality: string }[],
    unreachable: [] as { line: string; move: string }[],
    dropped: [] as { line: string; text: string; reason: string }[],
  };

  const positions: Record<PositionKey, LessonPosition> = {};
  for (const [key, position] of Object.entries(lesson.positions)) {
    const at = lines.get(key);
    if (!at) {
      positions[key] = position;
      continue;
    }
    const keepNote = (pos: Chess, line: readonly Uci[]) => async (note: Note) => {
      const reason = await overruled(note, pos, line, evaluation);
      if (reason) report.dropped.push({ line: sans(lesson, line), text: note.text, reason });
      return !reason;
    };
    const moves: LessonMove[] = [];
    for (const move of position.moves) {
      const after = played(at.pos, move.uci);
      const line = [...at.line, move.uci];
      let book = move.book;
      if (book && at.pos.turn === lesson.side) {
        const quality = classifyMove({
          before: await evaluation(at.line, at.pos),
          after: await evaluation(line, after),
          uci: move.uci,
          mover: lesson.side,
        });
        if (quality === 'mistake' || quality === 'blunder') {
          book = undefined;
          report.unbooked.push({
            line: sans(lesson, at.line),
            move: san(at.pos, move.uci),
            quality,
          });
        }
      }
      const notes = await filter(move.notes ?? [], keepNote(after, line));
      const { book: _book, notes: _notes, ...rest } = move;
      moves.push({ ...rest, ...(book && { book }), ...(notes.length > 0 && { notes }) });
    }
    const notes = await filter(position.notes ?? [], keepNote(at.pos, at.line));
    const { notes: _notes, ...rest } = position;
    positions[key] = { ...rest, moves, ...(notes.length > 0 && { notes }) };
  }

  const checked = { ...lesson, positions };
  const reached = bookReach(checked);
  for (const [key, position] of Object.entries(positions)) {
    const at = lines.get(key);
    // A position no line reaches is the checker's to refuse, not this.
    if (reached.has(key) || !at) continue;
    positions[key] = {
      ...position,
      moves: position.moves.map(({ book, ...move }) => {
        if (book)
          report.unreachable.push({ line: sans(lesson, at.line), move: san(at.pos, move.uci) });
        return move;
      }),
    };
  }
  return { lesson: checked, report };
}

/** Why the engine overrules `note`, checked in `pos` after `line`, or undefined when it doesn't. */
async function overruled(
  note: Note,
  pos: Chess,
  line: readonly Uci[],
  evaluation: (line: readonly Uci[], pos: Chess) => Promise<Evaluation>,
): Promise<string | undefined> {
  for (const idea of note.ideas ?? []) {
    const verdict = verdictOf(idea);
    if (idea.type === 'evaluation') {
      const engine = await evaluation(line, pos);
      if (apart(idea.value, engine)) return `says ${idea.value}, engine ${describe(engine)}`;
    }
    if ((idea.type === 'trap' || idea.type === 'line') && verdict) {
      let end = pos;
      const moves: Uci[] = [];
      for (const uci of idea.moves) {
        end = played(end, uci);
        moves.push(uci);
      }
      const engine = await evaluation([...line, ...moves], end);
      if (apart(verdict, engine)) return `${idea.type} ends ${verdict}, engine ${describe(engine)}`;
    }
    if (idea.type === 'trap' && idea.moves.length > 0) {
      const [tempting] = idea.moves;
      const quality = classifyMove({
        before: await evaluation(line, pos),
        after: await evaluation([...line, tempting], played(pos, tempting)),
        uci: tempting,
        mover: pos.turn,
      });
      if (quality === 'best' || quality === 'good')
        return `trap's ${san(pos, tempting)} is ${quality}`;
    }
  }
  return undefined;
}

const verdictOf = (idea: Idea): Verdict | undefined =>
  (idea.type === 'trap' || idea.type === 'line') && idea.verdict !== 'losesMaterial'
    ? idea.verdict
    : undefined;

/** The scale from Black winning (-3) to White winning (3). */
const STEPS: Readonly<Record<Verdict, number>> = {
  blackWinning: -3,
  blackClearly: -2,
  blackSlightly: -1,
  equal: 0,
  whiteSlightly: 1,
  whiteClearly: 2,
  whiteWinning: 3,
};

/**
 * Where an engine evaluation falls on that scale: under half a pawn is
 * equal, under one slightly better, under two clearly, then winning.
 * Openings are judged loosely, since engines see more than a guide's glyph means.
 */
function engineStep({ pawns, mate }: Evaluation): number {
  if (mate !== undefined) return mate > 0 ? 3 : mate < 0 ? -3 : 0;
  const size = [0.5, 1, 2].filter((limit) => Math.abs(pawns) >= limit).length;
  return Math.sign(pawns) * size;
}

const apart = (verdict: Verdict, engine: Evaluation) =>
  Math.abs(STEPS[verdict] - engineStep(engine)) >= 2;

const describe = ({ pawns, mate }: Evaluation) =>
  mate !== undefined ? `mate in ${mate}` : `${pawns > 0 ? '+' : ''}${pawns.toFixed(2)}`;

/** The lesson's start position, which the checker has read. */
const startOf = (lesson: Lesson): Chess => parsePosition(lesson.start)!;

/** The first line (UCI) found to each position the lesson reaches, and the position. */
function linesTo(lesson: Lesson): Map<PositionKey, { line: Uci[]; pos: Chess }> {
  const start = startOf(lesson);
  const found = new Map([[positionKey(start), { line: [] as Uci[], pos: start }]]);
  const queue = [...found.values()];
  for (let next = queue.shift(); next; next = queue.shift()) {
    for (const { uci } of lesson.positions[positionKey(next.pos)]?.moves ?? []) {
      const pos = played(next.pos, uci);
      const key = positionKey(pos);
      if (found.has(key)) continue;
      const at = { line: [...next.line, uci], pos };
      found.set(key, at);
      queue.push(at);
    }
  }
  return found;
}

/** The positions a learner reaches playing only book moves, against any opponent move. */
function bookReach(lesson: Lesson): Set<PositionKey> {
  const start = startOf(lesson);
  const reached = new Set([positionKey(start)]);
  const queue = [start];
  for (let pos = queue.shift(); pos; pos = queue.shift()) {
    for (const { uci, book } of lesson.positions[positionKey(pos)]?.moves ?? []) {
      if (pos.turn === lesson.side && !book) continue;
      const after = played(pos, uci);
      const key = positionKey(after);
      if (reached.has(key)) continue;
      reached.add(key);
      queue.push(after);
    }
  }
  return reached;
}

function played(pos: Chess, uci: Uci): Chess {
  const after = pos.clone();
  after.play(parseUci(uci)!);
  return after;
}

const san = (pos: Chess, uci: Uci) => makeSan(pos, parseUci(uci)!);

/** `line` from the lesson's start in SAN, like "1.d4 d5 2.c4". */
function sans(lesson: Lesson, line: readonly Uci[]): string {
  let pos = startOf(lesson);
  return line
    .map((uci) => {
      const number = pos.turn === 'white' ? `${pos.fullmoves}.` : '';
      const move = `${number}${san(pos, uci)}`;
      pos = played(pos, uci);
      return move;
    })
    .join(' ');
}

async function filter<T>(items: readonly T[], keep: (item: T) => Promise<boolean>): Promise<T[]> {
  const kept: T[] = [];
  for (const item of items) if (await keep(item)) kept.push(item);
  return kept;
}
