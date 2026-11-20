/**
 * Checks a lesson against an engine before it is written, so that a lesson
 * merged from several guides never recommends a bad move or shows a verdict
 * the engine contradicts:
 *
 * - A learner's book move the engine calls a mistake or a blunder (the app's
 *   own move labels, analysis/quality.ts) stops being a book move, and so does
 *   every book move only reachable through it. An inaccuracy stays: opening
 *   theory is full of them, and the app labels it for the learner anyway.
 * - A note goes when its verdict is two or more steps from the engine's on
 *   the scale = ⩲ ± +- (an evaluation badge, or where a line or trap ends),
 *   unless it only understates the same side's edge, or when its trap's first
 *   move is not an error at all.
 *
 * Each change is reported, so a person can read what the engine overruled.
 */
import { Chess } from 'chessops/chess';

import type { Evaluation } from '@/evaluation/evaluation';
import { classifyMove } from '@/analysis/quality';
import { numberedLine, parsePosition, playLine, playMove, positionKey } from '@/game/replay';
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
  /**
   * Each position whose overruled moves were taken out, since the guide had
   * nothing else there, with how many positions went with them.
   */
  readonly cut: readonly { line: string; moves: readonly string[]; positions: number }[];
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
    cut: [] as { line: string; moves: string[]; positions: number }[],
    dropped: [] as { line: string; text: string; reason: string }[],
  };

  const positions: Record<PositionKey, LessonPosition> = {};
  const unbooked = new Map<PositionKey, Uci[]>();
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
          unbooked.set(key, [...(unbooked.get(key) ?? []), move.uci]);
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

  cutLines(lesson, positions, unbooked, lines, report.cut);
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

/**
 * Takes out each overruled move that was the guide's only recommendation:
 * left in, the lesson would still offer it as the main move there (the
 * first candidate). The line ends before it instead, and the positions only
 * it reached go too. A position left with no moves goes, like any line's end.
 */
function cutLines(
  lesson: Lesson,
  positions: Record<PositionKey, LessonPosition>,
  unbooked: ReadonlyMap<PositionKey, readonly Uci[]>,
  lines: ReadonlyMap<PositionKey, { line: Uci[]; pos: Chess }>,
  cut: { line: string; moves: string[]; positions: number }[],
) {
  for (const [key, ucis] of unbooked) {
    const position = positions[key];
    // Gone already when an earlier cut was the only way to it.
    if (!position || position.moves.some(({ book }) => book)) continue;
    const at = lines.get(key)!;
    const before = Object.keys(positions).length;
    const moves = position.moves.filter(({ uci }) => !ucis.includes(uci));
    if (moves.length > 0) positions[key] = { ...position, moves };
    else delete positions[key];
    const still = linesTo({ ...lesson, positions });
    for (const other of Object.keys(positions))
      if (lines.has(other) && !still.has(other)) delete positions[other];
    cut.push({
      line: sans(lesson, at.line),
      moves: ucis.map((uci) => san(at.pos, uci)),
      positions: before - Object.keys(positions).length,
    });
  }
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
function engineStep({ score, pawns, mate }: Evaluation): number {
  // A checkmated position has mate 0, so the score says who won.
  if (mate !== undefined) return score > 0.5 ? 3 : -3;
  const size = [0.5, 1, 2].filter((limit) => Math.abs(pawns) >= limit).length;
  return Math.sign(pawns) * size;
}

/**
 * Whether `verdict` is two or more steps from the engine's, other than by
 * understating the same side's edge: "slightly worse" where the engine sees
 * a lost position still warns the learner rightly.
 */
function apart(verdict: Verdict, engine: Evaluation): boolean {
  const said = STEPS[verdict];
  const seen = engineStep(engine);
  const understated =
    said !== 0 && Math.sign(said) === Math.sign(seen) && Math.abs(said) < Math.abs(seen);
  return Math.abs(said - seen) >= 2 && !understated;
}

const describe = ({ pawns, mate }: Evaluation) =>
  mate === 0
    ? 'checkmate'
    : mate !== undefined
      ? `mate in ${mate}`
      : `${pawns > 0 ? '+' : ''}${pawns.toFixed(2)}`;

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

/** The position after `uci`, which the checker has found legal. */
function played(pos: Chess, uci: Uci): Chess {
  const after = pos.clone();
  playMove(after, uci);
  return after;
}

const san = (pos: Chess, uci: Uci) => playMove(pos.clone(), uci)!.san;

/** `line` from the lesson's start in SAN, like "1.d4 d5 2.c4". */
function sans(lesson: Lesson, line: readonly Uci[]): string {
  const start = startOf(lesson);
  const firstPly = 2 * start.fullmoves - (start.turn === 'white' ? 1 : 0);
  const moves = Array.from(playLine(line, start), ({ move }) => move?.san).filter(
    (move) => move !== undefined,
  );
  return numberedLine(moves, firstPly);
}

async function filter<T>(items: readonly T[], keep: (item: T) => Promise<boolean>): Promise<T[]> {
  const kept: T[] = [];
  for (const item of items) if (await keep(item)) kept.push(item);
  return kept;
}
