/**
 * The rules checker for lesson files: tests every fact a lesson states
 * against the board, so nothing false is drawn. Judgments come from the study
 * and are only checked to be legal or well formed: verdicts, evaluations,
 * risk tags, and a threat's answer. The importer (planned) will run it and
 * drop ideas that fail; a test runs it on every lesson the app ships.
 */
import { attacks, between, pawnAttacks, ray } from 'chessops/attacks';
import type { Board } from 'chessops/board';
import { Chess } from 'chessops/chess';
import { SquareSet } from 'chessops/squareSet';
import { COLORS, type Color, FILE_NAMES, type NormalMove, type Piece, type Square } from 'chessops/types';
import { kingCastlesTo, makeSquare, opposite, parseSquare, parseUci, rookCastlesTo } from 'chessops/util';

import { balance, points, VALUES } from '@/game/material';
import { parsePosition, parsePositionKey, positionKey, recordedMove } from '@/game/replay';

import {
  EVALUATIONS,
  IMBALANCE_KINDS,
  MAX_NOTE_WORDS,
  RELATIONS,
  RISKS,
  type Idea,
  type Imbalance,
  type Lesson,
  type LessonMove,
  type LessonPosition,
  type Line,
  type Note,
  type Plan,
  type Pressure,
  type Purpose,
  type Structure,
  type StructureFeature,
  type Threat,
  type Trap,
} from './lesson';
import {
  filePawnCount,
  isBackward,
  isIsolated,
  isOutpost,
  isPassed,
  isPawnChain,
  isWeakSquare,
  pawnSteps,
  space,
  stopSquare,
} from './pawns';

/** One thing wrong with a lesson, and where: a path into the file. */
export interface LessonProblem {
  readonly path: string;
  readonly message: string;
}

/** The positions an idea may refer to (see `Idea`). */
export interface IdeaPositions {
  /** The note's position, or the position after the note's move. */
  readonly after: Chess;
  /** The position before the note's move; absent for a position's notes. */
  readonly before?: Chess;
}

/** Why `idea` is false in its position, or undefined if it holds. */
export function checkIdea(idea: Idea, positions: IdeaPositions): string | undefined {
  try {
    const pos = idea.at === 'before' ? positions.before : positions.after;
    if (!pos) fail(`at 'before' only applies to a move's ideas`);
    CHECKS[idea.type](pos, idea as never);
    return undefined;
  } catch (error) {
    if (error instanceof Rejection) return error.message;
    if (error instanceof TypeError) return `malformed ${idea?.type ?? 'idea'}: ${error.message}`;
    throw error;
  }
}

type Report = (path: string, message: string) => void;

/** Everything wrong with `lesson`; empty when it is sound. */
export function checkLesson(lesson: Lesson): LessonProblem[] {
  const problems: LessonProblem[] = [];
  const report: Report = (path, message) => problems.push({ path, message });

  if (!COLORS.includes(lesson.side)) report('side', `${lesson.side} is not a color`);
  const bands = lesson.popularity?.ratingBands ?? [];
  if (!bands.every((band, i) => isCount(band) && (i === 0 || band > bands[i - 1]))) {
    report('popularity.ratingBands', 'must be whole numbers in ascending order');
  }
  checkVariations(lesson, report);

  const start = parsePosition(lesson.start);
  if (!start) {
    report('start', `${lesson.start} is not a legal position`);
    return problems;
  }
  const startKey = positionKey(start);
  if (!(startKey in lesson.positions)) report('start', `has no entry in positions (${startKey})`);

  const children = new Map<string, string[]>();
  for (const [key, entry] of Object.entries(lesson.positions)) {
    const next = checkPosition(lesson, key, entry, report);
    if (next) children.set(key, next);
  }
  const reached = reachable(startKey, children);
  for (const key of children.keys()) {
    if (!reached.has(key)) report(`positions[${JSON.stringify(key)}]`, 'is not reachable from start');
  }
  return problems;
}

/**
 * Checks one entry of `lesson.positions`, and returns the keys its moves
 * lead to, or undefined when `key` is not a position key.
 */
function checkPosition(lesson: Lesson, key: string, entry: LessonPosition, report: Report): string[] | undefined {
  const at = `positions[${JSON.stringify(key)}]`;
  const pos = parsePositionKey(key);
  if (!pos) {
    report(at, 'key is not a position key (FEN without move counters, see positionKey)');
    return undefined;
  }
  if (!(entry.variation in lesson.variations)) {
    report(`${at}.variation`, `${entry.variation} is not in variations`);
  }
  checkNotes(entry.notes, { after: pos }, `${at}.notes`, report);
  const next: string[] = [];
  const seen = new Set<string>();
  entry.moves.forEach((move, i) => {
    const path = `${at}.moves[${i}]`;
    if (seen.has(move.uci)) report(path, `${move.uci} is listed twice`);
    seen.add(move.uci);
    const after = checkMove(lesson, pos, move, path, report);
    if (!after) return;
    next.push(positionKey(after));
    checkNotes(move.notes, { before: pos, after }, `${path}.notes`, report);
  });
  return next;
}

/** Every position key reachable from `start` along `children`. */
function reachable(start: string, children: ReadonlyMap<string, readonly string[]>): Set<string> {
  const reached = new Set([start]);
  const stack = [start];
  for (let key = stack.pop(); key !== undefined; key = stack.pop()) {
    for (const child of children.get(key) ?? []) {
      if (!reached.has(child)) {
        reached.add(child);
        stack.push(child);
      }
    }
  }
  return reached;
}

function checkVariations(lesson: Lesson, report: Report) {
  const roots = Object.keys(lesson.variations).filter((id) => lesson.variations[id].parent === undefined);
  if (roots.length !== 1) report('variations', `need exactly one without a parent, found ${roots.length}`);
  for (const [id, variation] of Object.entries(lesson.variations)) {
    const at = `variations[${JSON.stringify(id)}]`;
    if (!variation.name.trim()) report(`${at}.name`, 'is empty');
    const ancestors = new Set([id]);
    for (let parent = variation.parent; parent !== undefined; parent = lesson.variations[parent]?.parent) {
      if (!(parent in lesson.variations)) {
        report(`${at}.parent`, `${parent} is not in variations`);
        break;
      }
      if (ancestors.has(parent)) {
        report(`${at}.parent`, 'variations form a cycle');
        break;
      }
      ancestors.add(parent);
    }
  }
}

/** The position after `move`, or undefined after reporting why it is wrong. */
function checkMove(
  lesson: Lesson,
  pos: Chess,
  move: LessonMove,
  path: string,
  report: Report,
): Chess | undefined {
  const { games, risk } = move;
  if (move.book && pos.turn !== lesson.side) report(`${path}.book`, `only ${lesson.side}'s moves are book moves`);
  const bands = lesson.popularity?.ratingBands;
  if (games && !bands) report(`${path}.games`, 'needs popularity in the lesson');
  if (games && bands && (games.length !== bands.length || !games.every(isCount))) {
    report(`${path}.games`, 'needs one whole count per rating band');
  }
  if (risk !== undefined && !RISKS.includes(risk)) report(`${path}.risk`, `${risk} is not one of ${RISKS.join(', ')}`);
  try {
    return played(pos, [move.uci]);
  } catch (error) {
    if (!(error instanceof Rejection)) throw error;
    report(`${path}.uci`, error.message);
    return undefined;
  }
}

const isCount = (n: number) => Number.isInteger(n) && n >= 0;

function checkNotes(
  notes: readonly Note[] | undefined,
  positions: IdeaPositions,
  path: string,
  report: Report,
) {
  notes?.forEach((note, i) => {
    const words = note.text.split(/\s+/).filter(Boolean).length;
    if (words === 0) report(`${path}[${i}].text`, 'is empty');
    if (words > MAX_NOTE_WORDS) report(`${path}[${i}].text`, `has ${words} words (most ${MAX_NOTE_WORDS})`);
    note.ideas?.forEach((idea, j) => {
      const problem = checkIdea(idea, positions);
      if (problem) report(`${path}[${i}].ideas[${j}]`, `${idea.type}: ${problem}`);
    });
  });
}

// ---------------------------------------------------------------- helpers

class Rejection extends Error {}

function fail(message: string): never {
  throw new Rejection(message);
}

function square(name: string): Square {
  return parseSquare(name) ?? fail(`${name} is not a square`);
}

function oneOf(values: readonly string[], value: string, what: string): void {
  if (!values.includes(value)) fail(`${what} ${value} is not one of ${values.join(', ')}`);
}

/** `uci` as a legal move in `pos`, written as lesson files write it. */
function legalMove(pos: Chess, uci: string): NormalMove {
  const recorded = recordedMove(pos, uci);
  if (recorded === undefined) fail(`${uci} is not legal for ${pos.turn} here`);
  if (recorded !== uci) fail(`write castling ${uci} as the king's two-square move (${recorded})`);
  return parseUci(uci) as NormalMove; // recordedMove refuses drops
}

/** A copy of `pos` after the legal moves `ucis`. */
function played(pos: Chess, ucis: readonly string[]): Chess {
  const after = pos.clone();
  for (const uci of ucis) after.play(legalMove(after, uci));
  return after;
}

/** A copy of `pos` with `color` to move, as if the other side passed. */
function withTurn(pos: Chess, color: Color): Chess {
  const copy = pos.clone();
  if (copy.turn !== color) {
    copy.turn = color;
    copy.epSquare = undefined;
  }
  return copy;
}

function pieceAt(board: Board, at: string, what: string): Piece {
  return board.get(square(at)) ?? fail(`${what} ${at} is empty`);
}

/**
 * `color`'s pieces bearing on `target`: those attacking it, and those lined
 * up behind them on the same line (a battery).
 */
function bearing(pos: Chess, color: Color, target: Square): SquareSet {
  let found = SquareSet.empty();
  let occupied = pos.board.occupied;
  for (;;) {
    // kingAttackers works for any square, despite its name.
    const more = pos.kingAttackers(target, color, occupied).diff(found);
    if (more.isEmpty()) return found;
    found = found.union(more);
    occupied = occupied.diff(more);
  }
}

// ---------------------------------------------------------------- ideas

function checkPurpose(pos: Chess, idea: Purpose) {
  oneOf(RELATIONS, idea.relation, 'relation');
  if (idea.targets.length === 0) fail('needs a target');
  const { board } = pos;
  const from = square(idea.from);
  const piece = pieceAt(board, idea.from, 'from');
  const reach = attacks(piece, from, board.occupied);
  const name = `the ${piece.role} on ${idea.from}`;
  for (const at of idea.targets) {
    const target = square(at);
    const there = board.get(target);
    const enemy = there !== undefined && there.color !== piece.color;
    const hits = reach.has(target);
    switch (idea.relation) {
      case 'attacks':
        if (!hits) fail(`${name} does not attack ${at}`);
        if (!enemy) fail(`no enemy piece on ${at} (use controls for a square)`);
        break;
      case 'defends':
        if (!hits) fail(`${name} does not reach ${at}`);
        if (there?.color !== piece.color) fail(`no friendly piece on ${at}`);
        break;
      case 'controls':
        if (!hits) fail(`${name} does not control ${at}`);
        break;
      case 'checks':
        if (!(hits && enemy && there.role === 'king')) fail(`${name} does not check a king on ${at}`);
        break;
      case 'pins':
        if (!(hits && enemy && pins(board, from, target))) fail(`${name} does not pin the piece on ${at}`);
        break;
      case 'blocks':
        if (!blocks(board, from, target)) {
          fail(`${name} neither shields ${at} from an enemy line piece nor blockades a pawn there`);
        }
        break;
      case 'aims':
        if (!aims(piece, from, target, board)) fail(`${name} has no blocked line to ${at}`);
        break;
    }
  }
}

/** `from` is a line piece that pins the enemy piece on `target`, which it attacks. */
function pins(board: Board, from: Square, target: Square): boolean {
  const pinner = board.get(from)!;
  const pinned = board.get(target)!;
  // The next piece past the target on the pinner's line.
  const next = attacks(pinner, target, board.occupied).intersect(ray(from, target)).intersect(board.occupied);
  const beyond = next.without(from).singleSquare();
  const back = beyond === undefined ? undefined : board.get(beyond);
  return (
    board.sliders().has(from) &&
    back?.color === pinned.color &&
    // A king on the line is in check, not pinned.
    pinned.role !== 'king' &&
    (back.role === 'king' || VALUES[back.role] > VALUES[pinned.role])
  );
}

function blocks(board: Board, from: Square, target: Square): boolean {
  const blocker = board.get(from)!;
  const there = board.get(target);
  if (there?.role === 'pawn' && there.color !== blocker.color && stopSquare(there.color, target) === from) {
    return true;
  }
  const without = board.occupied.without(from);
  for (const sq of board[opposite(blocker.color)].intersect(board.sliders())) {
    if (between(sq, target).has(from) && attacks(board.get(sq)!, sq, without).has(target)) return true;
  }
  return false;
}

function aims(piece: Piece, from: Square, target: Square, board: Board): boolean {
  return (
    board.sliders().has(from) &&
    attacks(piece, from, SquareSet.empty()).has(target) &&
    between(from, target).intersects(board.occupied)
  );
}

function checkPressure(pos: Chess, idea: Pressure) {
  oneOf(COLORS, idea.side, 'side');
  const target = square(idea.target);
  const sameSet = (listed: readonly string[], actual: SquareSet, who: string) => {
    const set = listed.reduce((s, name) => s.with(square(name)), SquareSet.empty());
    if (set.size() !== listed.length || !set.equals(actual)) {
      fail(`${who} on ${idea.target} are ${[...actual].map(makeSquare).join(', ') || 'none'}`);
    }
  };
  const attackers = bearing(pos, idea.side, target);
  if (idea.attackers.length < 2) fail('needs at least two attackers');
  sameSet(idea.attackers, attackers, `${idea.side}'s pieces bearing`);
  sameSet(idea.defenders, bearing(pos, opposite(idea.side), target), 'the defenders');
}

/** The squares the `piece` on `from` can move to in one move of its own. */
function steps(board: Board, from: Square, piece: Piece): Square[] {
  if (piece.role === 'pawn') return pawnSteps(board, piece.color, from);
  return [...attacks(piece, from, board.occupied).diff(board[piece.color])];
}

/** The piece on `from` reaches `to` in at most `moves` moves, capturing only on `to`. */
function reaches(board: Board, from: Square, to: Square, moves: number): boolean {
  const piece = board.get(from)!;
  const rest = board.clone();
  rest.take(from);
  let frontier = [from];
  const seen = new Set(frontier);
  for (let i = 0; i < moves; i++) {
    const next: Square[] = [];
    for (const sq of frontier) {
      for (const step of steps(rest, sq, piece)) {
        if (step === to) return true;
        if (!rest.has(step) && !seen.has(step)) {
          seen.add(step);
          next.push(step);
        }
      }
    }
    frontier = next;
  }
  return false;
}

/**
 * The rook's move when the king route `from`-`to` is castling `color` may
 * still play on `board`, where earlier routes left the squares in
 * `vacated` empty; or undefined.
 */
function castlingRook(pos: Chess, board: Board, vacated: SquareSet, color: Color, from: Square, to: Square) {
  const side = to > from ? 'h' : 'a';
  const rook = pos.castles.rook[color][side];
  if (rook === undefined || vacated.has(from) || vacated.has(rook)) return undefined;
  if (board.kingOf(color) !== from || kingCastlesTo(color, side) !== to) return undefined;
  if (pos.castles.path[color][side].intersects(board.occupied)) return undefined;
  return { from: rook, to: rookCastlesTo(color, side) };
}

function checkPlan(pos: Chess, idea: Plan) {
  oneOf(COLORS, idea.side, 'side');
  if (idea.routes.length === 0) fail('needs a route');
  const board = pos.board.clone();
  // Where each route's piece stands now: a piece that moves again leaves its earlier end.
  const ends = new Set<Square>();
  let vacated = SquareSet.empty();
  idea.routes.forEach((route, i) => {
    const what = `route ${i + 1}`;
    const piece = pieceAt(board, route.from, `${what} from`);
    if (piece.color !== idea.side) fail(`${what}: the piece on ${route.from} is not ${idea.side}'s`);
    const moves = route.moves ?? 1;
    if (!Number.isInteger(moves) || moves < 1 || moves > 4) fail(`${what}: moves must be 1 to 4`);
    const from = square(route.from);
    const to = square(route.to);
    if (board.get(to)?.color === idea.side) fail(`${what}: ${route.to} holds ${idea.side}'s own piece`);
    const rook = piece.role === 'king' ? castlingRook(pos, board, vacated, idea.side, from, to) : undefined;
    if (rook) board.set(rook.to, board.take(rook.from)!);
    else if (!reaches(board, from, to, moves)) {
      fail(`${what}: the ${piece.role} on ${route.from} cannot reach ${route.to} in ${moves} move(s)`);
    }
    board.set(to, board.take(from)!);
    vacated = vacated.with(from);
    ends.delete(from);
    ends.add(to);
  });
  for (const goal of idea.goals ?? []) {
    const sq = square(goal);
    const covered = [...ends].some((end) => end === sq || attacks(board.get(end)!, end, board.occupied).has(sq));
    if (!covered) fail(`goal ${goal} is neither a route's end nor attacked from one`);
  }
}

function checkThreat(pos: Chess, idea: Threat) {
  oneOf(COLORS, idea.side, 'side');
  const threatening = withTurn(pos, idea.side);
  const move = legalMove(threatening, idea.move);
  if (threatening.board.getRole(move.to) === 'king') fail('the threat captures the king');
  if (idea.answer === undefined) return;
  if (pos.turn !== idea.side) legalMove(pos, idea.answer);
  else legalMove(played(threatening, [idea.move]), idea.answer);
}

function checkTrap(pos: Chess, idea: Trap) {
  if (idea.moves.length === 0) fail('needs a move');
  const victim = pos.turn;
  const end = played(pos, idea.moves);
  if (idea.verdict !== 'losesMaterial') {
    oneOf(EVALUATIONS, idea.verdict, 'verdict');
    return;
  }
  const lead = (p: Chess) => balance(p.board, victim);
  const mated = end.isCheckmate() && end.turn === victim;
  if (!mated && lead(end) - lead(pos) > -2) {
    fail(`${victim} does not lose material: balance goes ${lead(pos)} to ${lead(end)}`);
  }
}

function checkLine(pos: Chess, idea: Line) {
  if (idea.moves.length === 0) fail('needs a move');
  played(pos, idea.moves);
  oneOf(EVALUATIONS, idea.verdict, 'verdict');
}

function checkStructure(pos: Chess, idea: Structure) {
  oneOf(COLORS, idea.side, 'side');
  if (idea.features.length === 0) fail('needs a feature');
  for (const feature of idea.features) checkFeature(pos, idea.side, feature);
}

function checkFeature(pos: Chess, color: Color, feature: StructureFeature) {
  const { board } = pos;
  const ownPawn = (name: string) => {
    const sq = square(name);
    if (!board.pieces(color, 'pawn').has(sq)) fail(`no ${color} pawn on ${name}`);
    return sq;
  };
  const file = (name: string) => {
    oneOf(FILE_NAMES, name, 'file');
    return FILE_NAMES.indexOf(name as (typeof FILE_NAMES)[number]);
  };
  const count = (c: Color, name: string) => filePawnCount(board, c, file(name));
  const nonEmpty = <T,>(list: readonly T[]) => {
    if (list.length === 0) fail(`${feature.kind} needs at least one entry`);
    return list;
  };
  switch (feature.kind) {
    case 'isolatedPawn':
    case 'backwardPawn':
    case 'passedPawn': {
      const test = { isolatedPawn: isIsolated, backwardPawn: isBackward, passedPawn: isPassed }[feature.kind];
      for (const name of nonEmpty(feature.squares)) {
        if (!test(board, color, ownPawn(name))) fail(`the pawn on ${name} is not ${feature.kind.replace('Pawn', '')}`);
      }
      return;
    }
    case 'pawnChain':
      if (!isPawnChain(board, color, feature.squares.map(ownPawn))) {
        fail(`${feature.squares.join(', ')} are not a chain of ${color} pawns`);
      }
      return;
    case 'weakSquare':
      for (const name of nonEmpty(feature.squares)) {
        if (!isWeakSquare(board, color, square(name))) fail(`${name} is not a hole in ${color}'s camp`);
      }
      return;
    case 'outpost':
      for (const name of nonEmpty(feature.squares)) {
        if (!isOutpost(board, color, square(name))) fail(`${name} is not an outpost for ${color}`);
      }
      return;
    case 'doubledPawns':
    case 'openFile':
    case 'halfOpenFile': {
      const { holds, says } = FILE_FEATURES[feature.kind];
      for (const name of nonEmpty(feature.files)) {
        if (!holds(count(color, name), count(opposite(color), name))) fail(says(name, color));
      }
      return;
    }
    case 'pawnMajority': {
      const total = (c: Color) => nonEmpty(feature.files).reduce((n, name) => n + count(c, name), 0);
      if (total(color) <= total(opposite(color))) fail(`${color} has no pawn majority on ${feature.files.join('')}`);
      return;
    }
    case 'pawnBreak': {
      const mover = withTurn(pos, color);
      const move = legalMove(mover, feature.move);
      if (mover.board.getRole(move.from) !== 'pawn') fail(`${feature.move} is not a pawn move`);
      // Contact: the break takes a pawn (en passant too), or stands attacking one (pawns attack mutually).
      const enemyPawns = (p: Chess) => p.board.pieces(opposite(color), 'pawn');
      const after = played(mover, [feature.move]);
      const contact =
        enemyPawns(after).size() < enemyPawns(mover).size() ||
        pawnAttacks(color, move.to).intersects(enemyPawns(after));
      if (!contact) fail(`${feature.move} makes no contact with an enemy pawn`);
      return;
    }
    default:
      fail(`unknown feature ${(feature as { kind: string }).kind}`);
  }
}

/** For each file feature: whether it holds given each side's pawns on the file, and why not. */
const FILE_FEATURES: Record<
  'doubledPawns' | 'openFile' | 'halfOpenFile',
  {
    readonly holds: (own: number, other: number) => boolean;
    readonly says: (file: string, color: Color) => string;
  }
> = {
  doubledPawns: { holds: (own) => own >= 2, says: (file, color) => `${color} has no doubled pawns on the ${file}-file` },
  openFile: { holds: (own, other) => own === 0 && other === 0, says: (file) => `the ${file}-file is not open` },
  halfOpenFile: {
    holds: (own, other) => own === 0 && other > 0,
    says: (file, color) => `the ${file}-file is not half-open for ${color}`,
  },
};

function checkImbalance(pos: Chess, idea: Imbalance) {
  oneOf(COLORS, idea.side, 'side');
  oneOf(IMBALANCE_KINDS, idea.kind, 'kind');
  const { board } = pos;
  const other = opposite(idea.side);
  const holds = {
    bishopPair: () => hasBishopPair(board, idea.side) && !hasBishopPair(board, other),
    material: () => points(board, idea.side) > points(board, other),
    space: () => space(board, idea.side) > space(board, other),
  }[idea.kind]();
  if (!holds) fail(`${idea.side} does not have the ${idea.kind} advantage`);
}

function hasBishopPair(board: Board, color: Color): boolean {
  const bishops = board.pieces(color, 'bishop');
  return bishops.intersects(SquareSet.lightSquares()) && bishops.intersects(SquareSet.darkSquares());
}

const CHECKS: { [T in Idea['type']]: (pos: Chess, idea: Extract<Idea, { type: T }>) => void } = {
  purpose: checkPurpose,
  pressure: checkPressure,
  plan: checkPlan,
  threat: checkThreat,
  trap: checkTrap,
  line: checkLine,
  structure: checkStructure,
  imbalance: checkImbalance,
  evaluation: (_pos, idea) => oneOf(EVALUATIONS, idea.value, 'evaluation'),
};
