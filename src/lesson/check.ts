/**
 * The rules checker for lesson files: tests every fact a lesson states
 * against the board, so nothing false is drawn. Judgments come from the study
 * and are only checked to be legal or well formed: verdicts, evaluations,
 * risk tags, and a threat's answer. The importer (scripts/import-study)
 * drops ideas that fail it; a test runs it on every lesson the app ships.
 */
import { attacks, between, pawnAttacks, ray } from 'chessops/attacks';
import type { Board } from 'chessops/board';
import { Chess } from 'chessops/chess';
import { SquareSet } from 'chessops/squareSet';
import {
  COLORS,
  type Color,
  FILE_NAMES,
  type NormalMove,
  type Piece,
  type Role,
  type Square,
} from 'chessops/types';
import { makeSquare, opposite, parseSquare, parseUci } from 'chessops/util';

import { MISTAKE_LOSS } from '@/analysis/quality';
import { balance, points, VALUES } from '@/game/material';
import {
  parsePosition,
  parsePositionKey,
  playMove,
  positionKey,
  recordedMove,
  takenRole,
  WRITTEN_MOVE,
  withTurn,
} from '@/game/replay';

import {
  AI_MODELS,
  EVALUATIONS,
  IMBALANCE_KINDS,
  MAX_NOTE_WORDS,
  onDomain,
  RELATIONS,
  RISKS,
  type Idea,
  type Imbalance,
  type Lesson,
  type LessonMove,
  type LessonPosition,
  type Line,
  type Mistake,
  type MistakeIdea,
  type Note,
  type Plan,
  type Pressure,
  type Purpose,
  type Structure,
  type StructureFeature,
  type Threat,
  type Uci,
  type VariationId,
} from './lesson';
import { needsBookMove } from './cleanRun';
import { isGuideLine, mistakeLine } from './mistakes';
import { guideMove } from './select';
import {
  filePawnCount,
  isBackward,
  isIsolated,
  isOutpost,
  isPassed,
  isPawnChain,
  isWeakSquare,
  pawnSteps,
  spaceSquares,
  stopSquare,
} from './pawns';
import { PlanBoard } from './plan';

/** One thing wrong with a lesson, and where: a path into the file. */
export interface LessonProblem {
  readonly path: string;
  readonly message: string;
}

/**
 * Why `idea` is false in `pos`, or undefined if it holds. `pos` is the note's
 * position, or the position after the note's move (see `Idea`).
 */
export function checkIdea(idea: Idea, pos: Chess): string | undefined {
  try {
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
  checkSources(lesson, report);
  checkVariations(lesson, report);

  const start = parsePosition(lesson.start);
  if (!start) {
    report('start', `${lesson.start} is not a legal position`);
    return problems;
  }
  const startKey = positionKey(start);
  if (!(startKey in lesson.positions)) report('start', `has no entry in positions (${startKey})`);

  const children = new Map<string, string[]>();
  /** Where the learner goes playing only book moves, against any opponent move. */
  const bookChildren = new Map<string, string[]>();
  /** The learner's positions without a book move. */
  const unbooked = new Set<string>();
  for (const [key, entry] of Object.entries(lesson.positions)) {
    const checked = checkPosition(lesson, key, entry, report);
    if (!checked) continue;
    const { learner, next } = checked;
    children.set(
      key,
      next.map(({ key: to }) => to),
    );
    bookChildren.set(
      key,
      next.filter(({ book }) => book || !learner).map(({ key: to }) => to),
    );
    if (learner && needsBookMove(entry.moves)) unbooked.add(key);
  }
  const reached = reachable(startKey, children);
  for (const key of children.keys()) {
    if (!reached.has(key))
      report(`positions[${JSON.stringify(key)}]`, 'is not reachable from start');
  }
  // A learner who has played only book moves must have one to play next.
  for (const key of reachable(startKey, bookChildren)) {
    if (unbooked.has(key))
      report(`positions[${JSON.stringify(key)}]`, 'is inside the book but has no book move');
  }
  return problems;
}

/**
 * Checks one entry of `lesson.positions`, and returns whether it is the
 * learner's turn and the keys its moves lead to, or undefined when `key` is
 * not a position key.
 */
function checkPosition(
  lesson: Lesson,
  key: string,
  entry: LessonPosition,
  report: Report,
): { learner: boolean; next: { key: string; book: boolean }[] } | undefined {
  const at = `positions[${JSON.stringify(key)}]`;
  const pos = parsePositionKey(key);
  if (!pos) {
    report(at, 'key is not a position key (FEN without move counters, see positionKey)');
    return undefined;
  }
  if (!(entry.variation in lesson.variations)) {
    report(`${at}.variation`, `${entry.variation} is not in variations`);
  }
  checkGames(lesson, entry.games, `${at}.games`, report);
  checkNotes(lesson, entry.notes, pos, `${at}.notes`, report);
  const next: { key: string; book: boolean }[] = [];
  const seen = new Set<string>();
  entry.moves.forEach((move, i) => {
    const path = `${at}.moves[${i}]`;
    if (seen.has(move.uci)) report(path, `${move.uci} is listed twice`);
    seen.add(move.uci);
    const after = checkMove(lesson, pos, move, path, report);
    if (!after) return;
    next.push({ key: positionKey(after), book: !!move.book });
    if (move.mistake) checkMistake(lesson, pos, move, move.mistake, `${path}.mistake`, report);
    checkNotes(lesson, move.notes, after, `${path}.notes`, report);
  });
  return { learner: pos.turn === lesson.side, next };
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

/** Hosts whose text is CC BY-SA 4.0 (Wikimedia projects): a lesson adapting it must say so. */
const SHARE_ALIKE_HOSTS = ['wikibooks.org', 'wikipedia.org'];

function checkSources({ sources }: Lesson, report: Report) {
  if (sources.length === 0) report('sources', 'needs at least one source');
  sources.forEach(({ title, author, url, license }, i) => {
    const at = `sources[${i}]`;
    if (!title.trim() || !author.trim()) report(at, 'needs a title and an author');
    if (sources.findIndex((other) => other.url === url) < i)
      report(`${at}.url`, `${url} is listed twice`);
    // Not URL.parse, which Node 22.0 lacks.
    const parsed = URL.canParse(url) ? new URL(url) : undefined;
    if (!parsed?.hostname) return report(`${at}.url`, `${url} is not a web address`);
    if (!license && SHARE_ALIKE_HOSTS.some((domain) => onDomain(parsed, domain))) {
      report(`${at}.license`, `is required for ${parsed.hostname}, whose text is share-alike`);
    }
    if (license && (!license.name.trim() || !URL.canParse(license.url))) {
      report(`${at}.license`, 'needs a name and a URL');
    }
  });
}

function checkVariations(lesson: Lesson, report: Report) {
  const roots = Object.keys(lesson.variations).filter(
    (id) => lesson.variations[id].parent === undefined,
  );
  if (roots.length !== 1)
    report('variations', `need exactly one without a parent, found ${roots.length}`);
  for (const [id, variation] of Object.entries(lesson.variations)) {
    const at = `variations[${JSON.stringify(id)}]`;
    if (!variation.name.trim()) report(`${at}.name`, 'is empty');
    const ancestors = new Set([id]);
    for (
      let parent = variation.parent;
      parent !== undefined;
      parent = lesson.variations[parent]?.parent
    ) {
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
  const named = namedVariations(lesson);
  for (const id of Object.keys(lesson.variations)) {
    if (!named.has(id))
      report(`variations[${JSON.stringify(id)}]`, 'names no position, in it or under it');
  }
}

/**
 * The variations that name a position, or hold one that does. Every other
 * name is a leftover: the opening list leaves it out and nothing shows it.
 */
export function namedVariations({ variations, positions }: Lesson): Set<VariationId> {
  const named = new Set<VariationId>();
  for (const { variation } of Object.values(positions)) {
    for (
      let id: VariationId | undefined = variation;
      id && !named.has(id);
      id = variations[id]?.parent
    )
      named.add(id);
  }
  return named;
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
  if (move.book && pos.turn !== lesson.side)
    report(`${path}.book`, `only ${lesson.side}'s moves are book moves`);
  checkGames(lesson, games, `${path}.games`, report);
  const riskProblem = risk === undefined ? undefined : notOneOf(RISKS, risk);
  if (riskProblem) report(`${path}.risk`, riskProblem);
  try {
    return played(pos, [move.uci]);
  } catch (error) {
    if (!(error instanceof Rejection)) throw error;
    report(`${path}.uci`, error.message);
    return undefined;
  }
}

const isCount = (n: number) => Number.isInteger(n) && n >= 0;

/** Checks game counts (a move's or a position's): one whole count per rating band. */
function checkGames(
  lesson: Lesson,
  games: readonly number[] | undefined,
  path: string,
  report: Report,
) {
  if (!games) return;
  const bands = lesson.popularity?.ratingBands;
  if (!bands) report(path, 'needs popularity in the lesson');
  else if (games.length !== bands.length || !games.every(isCount))
    report(path, 'needs one whole count per rating band');
}

/**
 * Checks the marker on `move`, legal in `pos`: its numbers in range, its
 * stored line made of guide moves and stored only where the guide's choice
 * rule plays another, and its verdict true of the line (`trapProblem`).
 */
function checkMistake(
  lesson: Lesson,
  pos: Chess,
  move: LessonMove,
  { cost, gain, name, verdict, line }: Mistake,
  path: string,
  report: Report,
) {
  if (move.book) report(path, BOOK_MARK);
  if (cost !== undefined && !(cost >= MISTAKE_LOSS && cost <= 1))
    report(`${path}.cost`, `must be from ${MISTAKE_LOSS} (a mistake) to 1`);
  const bands = lesson.popularity?.ratingBands;
  if (gain && (gain.length !== bands?.length || !gain.every((n) => n >= 0 && n <= 1)))
    report(`${path}.gain`, 'needs one expected score from 0 to 1 per rating band');
  if (name !== undefined && !name.trim()) report(`${path}.name`, 'is empty');
  const key = positionKey(pos);
  if (line) {
    const off = offGuide(lesson, pos, [move.uci, ...line]);
    if (off !== undefined)
      report(`${path}.line[${off - 1}]`, 'is not a guide move at its position');
    else if (isGuideLine(lesson, key, [move.uci, ...line]))
      report(`${path}.line`, 'is the line the guide gives anyway, so it is left out');
  }
  const problem = verdict && verdictProblem(lesson, pos, move, verdict);
  if (problem) report(`${path}.verdict`, problem);
}

/** The checker's problem with a mark on a book move. */
export const BOOK_MARK = 'marks a book move, which the guide recommends';

/** What's wrong with `verdict` as said of the line marked by `move`, legal in `pos`, if anything. */
export const verdictProblem = (
  lesson: Lesson,
  pos: Chess,
  move: LessonMove,
  verdict: Exclude<Mistake['verdict'], undefined>,
) => trapProblem(pos, mistakeLine(lesson, positionKey(pos), move), verdict);

/** The index of the first of `moves` from `pos` that isn't a guide move where it is played, if any. */
function offGuide(lesson: Lesson, pos: Chess, moves: readonly Uci[]): number | undefined {
  const at = pos.clone();
  for (const [n, uci] of moves.entries()) {
    if (!guideMove(lesson, positionKey(at), uci)) return n;
    playMove(at, uci);
  }
  return undefined;
}

const MOVE = new RegExp(String.raw`(?<![\w.])${WRITTEN_MOVE}(?![\w-])`, 'g');
/** Four moves with only whitespace between them: a line in notation, like `7.Nxd4 Nc5 8.Bc4 Nbd7`. */
const NOTATION_LINE = new RegExp(
  String.raw`(?<![\w.])${WRITTEN_MOVE}(?:\s+${WRITTEN_MOVE}){3}(?![\w-])`,
);
/** Words that only join moves in a list, like `...Bf5, then play ...e6 and ...c5`. */
const LIST_WORDS = /\b(?:and|then|or|play)\b/gi;

/**
 * What is wrong with note `text` written as moves instead of words, if
 * anything. A note puts a line in words; its idea draws the moves.
 */
export function notationProblem(text: string): string | undefined {
  if (NOTATION_LINE.test(text)) return 'writes a line of moves in notation';
  const hasMove = text.search(MOVE) >= 0;
  if (hasMove && !/[a-z]{2}/i.test(text.replace(MOVE, ' ').replace(LIST_WORDS, ' ')))
    return 'is only a list of moves';
  return undefined;
}

/**
 * Words that point outside the lesson, to the study a note came from or
 * another one, which the learner never sees: "see chapter 12", "the most
 * important section", "the heart button", "the video" a study links, "covered
 * in a different study". "Study" counts after a word that singles out a study
 * ("the", "another", "a different"), with at most one word between, so "study
 * it carefully" and "your study of the centre" pass.
 * The checker refuses a false hit (a "queenside section", "the players study
 * the line") like any other, so the importer asks for a new wording first.
 */
const STUDY_MENTION =
  /\b(?:chapters?|sections?|buttons?|videos?)\b|\b(?:a|an|the|this|that|these|those|our|my|another|other|separate|different|next|previous)\s+(?:\w+\s+)?stud(?:y|ies)\b/i;

/** Whether note `text` points to the study it came from. */
export const pointsToStudy = (text: string) => STUDY_MENTION.test(text);

/**
 * What is wrong with a note's text, or undefined: empty, too long, written in
 * notation, or pointing to the study.
 */
export function noteTextProblem(text: string): string | undefined {
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words === 0) return 'is empty';
  if (words > MAX_NOTE_WORDS) return `has ${words} words (most ${MAX_NOTE_WORDS})`;
  const notation = notationProblem(text);
  if (notation) return notation;
  if (pointsToStudy(text)) return 'points to the study it came from';
  return undefined;
}

/**
 * The idea types a generated note (`Note.generated`) may draw: what a move
 * does now, never a judgment, since no guide stands behind it.
 */
export const GENERATED_IDEAS = [
  'purpose',
  'pressure',
  'plan',
  'threat',
  'structure',
  'imbalance',
] as const;

/**
 * Why `threat` in `pos` is no real threat, or undefined when it is: its move
 * mates, takes an undefended piece, or takes a piece worth at least two
 * points more than the piece taking it. Held only against generated notes;
 * a guide may call a smaller threat one.
 */
function emptyThreat(threat: Threat, pos: Chess): string | undefined {
  const threatening = withTurn(pos, threat.side);
  const move = parseUci(threat.move) as NormalMove;
  const mover = threatening.board.get(move.from)!;
  const taken = takenRole(threatening, move);
  const after = threatening.clone();
  after.play(move);
  if (after.isCheckmate()) return undefined;
  if (!taken) return 'takes nothing and does not mate';
  if (bearing(after, after.turn, move.to).isEmpty()) return undefined;
  return pieceWorth(taken) - pieceWorth(mover.role) >= 2
    ? undefined
    : 'takes a defended piece and wins nothing';
}

/** A role's worth for weighing a capture or a pin: a king's is beyond any trade. */
const pieceWorth = (role: Role) => (role === 'king' ? Infinity : VALUES[role]);

/**
 * What a generated note (`Note.generated`) may not draw that a guide's may,
 * or undefined, worded to follow the idea's type ("threat takes nothing...").
 */
export function generatedIdeaProblem(idea: Idea, pos: Chess): string | undefined {
  if (!(GENERATED_IDEAS as readonly string[]).includes(idea.type))
    return 'is a type no generated note draws';
  return idea.type === 'threat' ? emptyThreat(idea, pos) : undefined;
}

function checkNotes(
  lesson: Lesson,
  notes: readonly Note[] | undefined,
  pos: Chess,
  path: string,
  report: Report,
) {
  const key = positionKey(pos);
  notes?.forEach((note, i) => {
    const wording = noteTextProblem(note.text);
    if (wording) report(`${path}[${i}].text`, wording);
    if (note.generated && note.original !== undefined)
      report(`${path}[${i}].original`, 'is on a generated note, which no guide wrote');
    // An empty model (or null in the JSON) credits nobody, like none at all.
    const modelProblem = note.model
      ? notOneOf(Object.keys(AI_MODELS), note.model)
      : note.generated && 'is missing on a generated note, so the app could not credit it';
    if (modelProblem) report(`${path}[${i}].model`, modelProblem);
    note.ideas?.forEach((idea, j) => {
      const problem =
        checkIdea(idea, pos) ??
        (note.generated ? generatedIdeaProblem(idea, pos) : undefined) ??
        (idea.type === 'mistake' ? unmarked(lesson, key, idea.move) : undefined);
      if (problem) report(`${path}[${i}].ideas[${j}]`, `${idea.type}: ${problem}`);
    });
  });
}

/** Why a note can't name `uci` at `key` as a mistake: the guide lists no marked move there. */
const unmarked = (lesson: Lesson, key: string, uci: Uci) =>
  guideMove(lesson, key, uci)?.mistake
    ? undefined
    : 'names a move the guide does not mark as a mistake here';

// ---------------------------------------------------------------- helpers

class Rejection extends Error {}

function fail(message: string): never {
  throw new Rejection(message);
}

function square(name: string): Square {
  return parseSquare(name) ?? fail(`${name} is not a square`);
}

function oneOf(values: readonly string[], value: string, what: string): void {
  const problem = notOneOf(values, value);
  if (problem) fail(`${what} ${problem}`);
}

/** Why `value` is none of `values`, or undefined when it is one. */
function notOneOf(values: readonly string[], value: string): string | undefined {
  return values.includes(value) ? undefined : `${value} is not one of ${values.join(', ')}`;
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
        if (!(hits && enemy && there.role === 'king'))
          fail(`${name} does not check a king on ${at}`);
        break;
      case 'pins':
        if (!(hits && enemy && pins(board, from, target)))
          fail(`${name} does not pin the piece on ${at}`);
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
  const next = attacks(pinner, target, board.occupied)
    .intersect(ray(from, target))
    .intersect(board.occupied);
  const beyond = next.without(from).singleSquare();
  const back = beyond === undefined ? undefined : board.get(beyond);
  return (
    board.sliders().has(from) &&
    back?.color === pinned.color &&
    // A king on the line is in check, not pinned.
    pinned.role !== 'king' &&
    pieceWorth(back.role) > VALUES[pinned.role]
  );
}

function blocks(board: Board, from: Square, target: Square): boolean {
  const blocker = board.get(from)!;
  const there = board.get(target);
  if (
    there?.role === 'pawn' &&
    there.color !== blocker.color &&
    stopSquare(there.color, target) === from
  ) {
    return true;
  }
  const without = board.occupied.without(from);
  for (const sq of board[opposite(blocker.color)].intersect(board.sliders())) {
    if (between(sq, target).has(from) && attacks(board.get(sq)!, sq, without).has(target))
      return true;
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

function checkPlan(pos: Chess, idea: Plan) {
  oneOf(COLORS, idea.side, 'side');
  if (idea.routes.length === 0) fail('needs a route');
  const plan = new PlanBoard(pos);
  const { board } = plan;
  // Where each route's piece stands now: a piece that moves again leaves its earlier end.
  const ends = new Set<Square>();
  idea.routes.forEach((route, i) => {
    const what = `route ${i + 1}`;
    const piece = pieceAt(board, route.from, `${what} from`);
    if (piece.color !== idea.side)
      fail(`${what}: the piece on ${route.from} is not ${idea.side}'s`);
    const moves = route.moves ?? 1;
    if (!Number.isInteger(moves) || moves < 1 || moves > 4) fail(`${what}: moves must be 1 to 4`);
    const from = square(route.from);
    const to = square(route.to);
    if (board.get(to)?.color === idea.side)
      fail(`${what}: ${route.to} holds ${idea.side}'s own piece`);
    if (!plan.castles(from, to) && !reaches(board, from, to, moves)) {
      fail(
        `${what}: the ${piece.role} on ${route.from} cannot reach ${route.to} in ${moves} move(s)`,
      );
    }
    plan.play(from, to);
    ends.delete(from);
    ends.add(to);
  });
  for (const goal of idea.goals ?? []) {
    const sq = square(goal);
    const covered = [...ends].some(
      (end) => end === sq || attacks(board.get(end)!, end, board.occupied).has(sq),
    );
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

/**
 * Why `verdict` is false of the trap `moves` plays from `pos`, which the side
 * to move falls into, or undefined when it holds: the moves are legal, and
 * `losesMaterial` costs that side at least two points or mates it.
 */
export function trapProblem(
  pos: Chess,
  moves: readonly Uci[],
  verdict: Exclude<Mistake['verdict'], undefined>,
): string | undefined {
  try {
    checkTrap(pos, moves, verdict);
    return undefined;
  } catch (error) {
    if (error instanceof Rejection) return error.message;
    throw error;
  }
}

function checkTrap(
  pos: Chess,
  moves: readonly Uci[],
  verdict: Exclude<Mistake['verdict'], undefined>,
) {
  if (moves.length === 0) fail('needs a move');
  const victim = pos.turn;
  const end = played(pos, moves);
  if (verdict !== 'losesMaterial') {
    oneOf(EVALUATIONS, verdict, 'verdict');
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
  const nonEmpty = <T>(list: readonly T[]) => {
    if (list.length === 0) fail(`${feature.kind} needs at least one entry`);
    return list;
  };
  switch (feature.kind) {
    case 'isolatedPawn':
    case 'backwardPawn':
    case 'passedPawn': {
      const test = { isolatedPawn: isIsolated, backwardPawn: isBackward, passedPawn: isPassed }[
        feature.kind
      ];
      for (const name of nonEmpty(feature.squares)) {
        if (!test(board, color, ownPawn(name)))
          fail(`the pawn on ${name} is not ${feature.kind.replace('Pawn', '')}`);
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
        if (!isWeakSquare(board, color, square(name)))
          fail(`${name} is not a hole in ${color}'s camp`);
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
      const total = (c: Color) =>
        nonEmpty(feature.files).reduce((n, name) => n + count(c, name), 0);
      if (total(color) <= total(opposite(color)))
        fail(`${color} has no pawn majority on ${feature.files.join('')}`);
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
  doubledPawns: {
    holds: (own) => own >= 2,
    says: (file, color) => `${color} has no doubled pawns on the ${file}-file`,
  },
  openFile: {
    holds: (own, other) => own === 0 && other === 0,
    says: (file) => `the ${file}-file is not open`,
  },
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
    space: () => spaceSquares(board, idea.side).size() > spaceSquares(board, other).size(),
  }[idea.kind]();
  if (!holds) fail(`${idea.side} does not have the ${idea.kind} advantage`);
}

function hasBishopPair(board: Board, color: Color): boolean {
  const bishops = board.pieces(color, 'bishop');
  return (
    bishops.intersects(SquareSet.lightSquares()) && bishops.intersects(SquareSet.darkSquares())
  );
}

const CHECKS: { [T in Idea['type']]: (pos: Chess, idea: Extract<Idea, { type: T }>) => void } = {
  purpose: checkPurpose,
  pressure: checkPressure,
  plan: checkPlan,
  threat: checkThreat,
  mistake: (pos, idea: MistakeIdea) => void legalMove(pos, idea.move),
  line: checkLine,
  structure: checkStructure,
  imbalance: checkImbalance,
  evaluation: (_pos, idea) => oneOf(EVALUATIONS, idea.value, 'evaluation'),
};
