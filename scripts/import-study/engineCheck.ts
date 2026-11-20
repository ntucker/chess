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
 *
 * `fillBook`, run before it on every lesson, picks a book move wherever the
 * guide shows the learner moves but recommends none.
 */
import { Chess } from 'chessops/chess';

import type { Evaluation } from '@/evaluation/evaluation';
import { classifyMove } from '@/analysis/quality';
import { lineSans, numberedLine, parsePosition, playMove, positionKey } from '@/game/replay';
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
   * Each position where the line now ends, since the engine overruled every
   * move the guide recommended there: its moves, and how many positions went.
   */
  readonly cut: readonly { line: string; moves: readonly string[]; positions: number }[];
  /** Notes dropped, where they were and why. */
  readonly dropped: readonly { line: string; text: string; reason: string }[];
  /** Book moves `fillBook` picked again where the engine overruled one of several guide moves. */
  readonly refilled: FillReport['filled'];
}

/** `lesson` with what `evaluate` overrules taken out, and what was taken. */
export async function engineCheck(
  lesson: Lesson,
  evaluate: Evaluate,
): Promise<{ lesson: Lesson; report: EngineReport }> {
  const lines = linesTo(lesson);
  const evaluation = cachedEvaluation(evaluate);
  const report = {
    unbooked: [] as { line: string; move: string; quality: string }[],
    unreachable: [] as { line: string; move: string }[],
    cut: [] as { line: string; moves: readonly string[]; positions: number }[],
    dropped: [] as { line: string; text: string; reason: string }[],
  };

  const positions: Record<PositionKey, LessonPosition> = {};
  /** Where the engine overruled a book move. */
  const overruledAt = new Set<PositionKey>();
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
          overruledAt.add(key);
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

  cutLines(lesson, positions, overruledAt, lines, report.cut);
  // Where it overruled one of several guide moves, pick again among them before
  // judging what book moves still reach: the line goes on through the guide's own.
  const refilled = await fillBook({ ...lesson, positions }, evaluate);
  const filled = { ...refilled.lesson.positions };
  const checked = { ...lesson, positions: filled };
  const reached = bookReach(checked);
  for (const [key, position] of Object.entries(filled)) {
    const at = lines.get(key);
    // A position no line reaches is the checker's to refuse, not this.
    if (reached.has(key) || !at) continue;
    filled[key] = {
      ...position,
      moves: position.moves.map(({ book, ...move }) => {
        if (book)
          report.unreachable.push({ line: sans(lesson, at.line), move: san(at.pos, move.uci) });
        return move;
      }),
    };
  }
  report.cut.push(...refilled.report.ended);
  return { lesson: checked, report: { ...report, refilled: refilled.report.filled } };
}

/**
 * Ends the line where the engine overruled the guide's only move there:
 * left in, the lesson would still offer the overruled move as its main one.
 * The position goes with its move, like any line's end, and so do the
 * positions only it reached. Where the guide shows other moves, the
 * position stays without a book move for `fillBook` to pick one again
 * (4.d3 in the Giuoco Piano, whose guide books 4...f5 but also shows 4...Nf6).
 */
function cutLines(
  lesson: Lesson,
  positions: Record<PositionKey, LessonPosition>,
  overruledAt: ReadonlySet<PositionKey>,
  lines: ReadonlyMap<PositionKey, { line: Uci[]; pos: Chess }>,
  cut: { line: string; moves: readonly string[]; positions: number }[],
) {
  for (const key of overruledAt) {
    const position = positions[key];
    // Gone already when an earlier cut was the only way to it.
    if (!position || position.moves.some(({ book }) => book)) continue;
    if (position.moves.length > 1) continue;
    const at = lines.get(key)!;
    cut.push({
      line: sans(lesson, at.line),
      moves: position.moves.map(({ uci }) => san(at.pos, uci)),
      positions: endLine(lesson, positions, key, lines),
    });
  }
}

/**
 * Deletes the position `key` and the positions only it reached, so the line
 * ends at the move into it; how many positions went.
 */
function endLine(
  lesson: Lesson,
  positions: Record<PositionKey, LessonPosition>,
  key: PositionKey,
  lines: ReadonlyMap<PositionKey, unknown>,
): number {
  const before = Object.keys(positions).length;
  delete positions[key];
  const still = linesTo({ ...lesson, positions });
  for (const other of Object.keys(positions))
    if (lines.has(other) && !still.has(other)) delete positions[other];
  return before - Object.keys(positions).length;
}

/** Why `fillBook` booked a move no guide shows. */
export const ENGINES_OWN = "Stockfish's best: the engine overruled every guide move";

export interface FillReport {
  /** Book moves picked where the guide recommended none, with the line before each and why. */
  readonly filled: readonly { line: string; move: string; why: string }[];
  /** Positions where the line now ends, since the engine overruled every move the guide shows. */
  readonly ended: readonly { line: string; moves: readonly string[]; positions: number }[];
}

/**
 * A note that names its own move the main line: "This is the main line".
 * One that only starts with "The main line" may go on to name another move
 * ("The main line is 3.Nc3"), so it doesn't count.
 */
const MAIN = /\bthis is the main (?:line|move|reply|continuation)\b/i;

/**
 * `lesson` with a book move wherever a learner playing only book moves meets
 * the guide's moves but no recommended one: a guide's alternative it
 * analyses where another chapter transposes, or a trap's punishing reply only
 * comment text gives. The pick is the guide's only move there, or the one its
 * note calls the main line, else Stockfish's best of the guide's moves; never
 * one the engine calls a mistake or a blunder. Where every move is one,
 * Stockfish's own best move becomes the book move, so the guide's moves stay
 * as warnings ("Bf5 is a blunder here"); the line ends after it. Only a
 * position the engine names no move for ends the line there.
 */
export async function fillBook(
  lesson: Lesson,
  evaluate: Evaluate,
): Promise<{ lesson: Lesson; report: FillReport }> {
  const evaluation = cachedEvaluation(evaluate);
  const lines = linesTo(lesson);
  const positions = { ...lesson.positions };
  const report = {
    filled: [] as { line: string; move: string; why: string }[],
    ended: [] as { line: string; moves: string[]; positions: number }[],
  };
  const start = startOf(lesson);
  const reached = new Set([positionKey(start)]);
  const queue = [{ line: [] as Uci[], pos: start }];
  for (let at = queue.shift(); at; at = queue.shift()) {
    const key = positionKey(at.pos);
    let position = positions[key];
    if (!position) continue;
    const learner = at.pos.turn === lesson.side;
    if (learner && position.moves.length > 0 && !position.moves.some(({ book }) => book)) {
      const pick = await pickBookMove(position, at, evaluation, lesson.side);
      if (!pick) {
        const moves = position.moves.map(({ uci }) => san(at.pos, uci));
        const gone = endLine(lesson, positions, key, lines);
        report.ended.push({ line: sans(lesson, at.line), moves, positions: gone });
        continue;
      }
      const listed = position.moves.some(({ uci }) => uci === pick.uci);
      const moves = [
        ...position.moves.map((move) =>
          move.uci === pick.uci ? { ...move, book: true as const } : move,
        ),
        ...(listed ? [] : [{ uci: pick.uci, book: true as const }]),
      ];
      // Book moves first, like every position the importer writes.
      moves.sort((a, b) => Number(!!b.book) - Number(!!a.book));
      positions[key] = position = { ...position, moves };
      report.filled.push({
        line: sans(lesson, at.line),
        move: san(at.pos, pick.uci),
        why: pick.why,
      });
    }
    for (const { uci, book } of position.moves) {
      if (learner && !book) continue;
      const pos = played(at.pos, uci);
      if (reached.has(positionKey(pos))) continue;
      reached.add(positionKey(pos));
      queue.push({ line: [...at.line, uci], pos });
    }
  }
  return { lesson: { ...lesson, positions }, report };
}

/**
 * The book move `fillBook` picks at `at`, and why: one of the guide's moves
 * there, or the engine's own when it overrules them all; undefined when it
 * names none. A move the guide warns against with a trap is either one the
 * engine rates a mistake, so never picked, or one whose trap `engineCheck`
 * drops as no error.
 */
async function pickBookMove(
  position: LessonPosition,
  at: { line: readonly Uci[]; pos: Chess },
  evaluation: CachedEvaluation,
  side: Lesson['side'],
): Promise<{ uci: Uci; why: string } | undefined> {
  const before = await evaluation(at.line, at.pos);
  const judged = await Promise.all(
    position.moves.map(async ({ uci, notes }) => {
      const after = await evaluation([...at.line, uci], played(at.pos, uci));
      const quality = classifyMove({ before, after, uci, mover: side });
      const sound = quality !== 'mistake' && quality !== 'blunder';
      const main = !!notes?.some(({ text }) => MAIN.test(text));
      return { uci, sound, main, score: side === 'white' ? after.score : 1 - after.score };
    }),
  );
  const main = judged.filter((move) => move.main);
  const preferred = judged.length === 1 ? judged[0] : main.length === 1 ? main[0] : undefined;
  if (preferred?.sound)
    return { uci: preferred.uci, why: judged.length === 1 ? 'only move' : 'called the main line' };
  const best = judged.filter(({ sound }) => sound).sort((a, b) => b.score - a.score)[0];
  if (best) return { uci: best.uci, why: "Stockfish's best of the guide's moves" };
  if (before.best === undefined) return undefined;
  return { uci: before.best, why: ENGINES_OWN };
}

type CachedEvaluation = (line: readonly Uci[], pos: Chess) => Promise<Evaluation>;

/** `evaluate`, asked once per position. */
function cachedEvaluation(evaluate: Evaluate): CachedEvaluation {
  const cache = new Map<PositionKey, Promise<Evaluation>>();
  return (line, pos) => {
    const key = positionKey(pos);
    if (!cache.has(key)) cache.set(key, evaluate(line, key));
    return cache.get(key)!;
  };
}

/** Why the engine overrules `note`, checked in `pos` after `line`, or undefined when it doesn't. */
async function overruled(
  note: Note,
  pos: Chess,
  line: readonly Uci[],
  evaluation: CachedEvaluation,
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
export function bookReach(lesson: Lesson): Set<PositionKey> {
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
  return numberedLine(lineSans(line, start), firstPly);
}

async function filter<T>(items: readonly T[], keep: (item: T) => Promise<boolean>): Promise<T[]> {
  const kept: T[] = [];
  for (const item of items) if (await keep(item)) kept.push(item);
  return kept;
}
