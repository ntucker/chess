/**
 * The moves and squares a note's text names, each with the board it stands
 * for, so the idea card can show a small board for it. A square ("the e5
 * pawn", "takes on d4") is shown lit in the note's position. A move ("Bf5",
 * "...e5", "O-O", "a4-a5") is shown played, from the nearest position where
 * it is legal: the note's own position (with a threat's side to move there),
 * the position its move was played in, then the positions its line or trap
 * and the guide lead to, a ply at a time. Where the nearest positions disagree on which move it is, or none
 * within reach has it, the text stays plain: a guess shown as fact misleads.
 */
import { Chess } from 'chessops/chess';
import { parseSan } from 'chessops/san';
import type { Color, SquareName } from 'chessops/types';
import { makeSquare, makeUci, parseUci } from 'chessops/util';

import { positionKey, readPositionKey, recordedMove, SAN } from '@/game/replay';

import type { Lesson, PositionKey, Uci } from './lesson';
import type { ShownNote } from './view';

/** A move or square a note names, and the board that shows it. */
export interface Mention {
  /** The words as the note writes them: `Bf5`, `...e5`, `d4`. */
  readonly text: string;
  /** The position the board shows: the note's for a square, the one after it for a move. */
  readonly key: PositionKey;
  /** The squares lit: a move's from and to (castling's king), or the one square. */
  readonly lit: readonly SquareName[];
  /** Whether it names a move or a square. */
  readonly kind: 'move' | 'square';
}

/** A note's text in order: plain words, and the mentions between them. */
export type NotePart = string | Mention;

/** How many plies past the note's position a mentioned move is looked for. */
const REACH = 4;

/**
 * A mention as text writes it. Groups: a move number's dots (`.` for White,
 * `...` for Black) or bare `...`; the SAN; a route's squares (`a4-a5`).
 * Never inside a word, a file's name (`c-file`) or a longer route.
 */
const MENTION = new RegExp(
  String.raw`(?<![\w.-])(?:\d+\s?(\.(?:\.\.)?)\s?|(\.\.\.))?(?:([a-h][1-8])-([a-h][1-8])|(${SAN}))[!?]*(?![\w-])`,
  'g',
);
const SQUARE = /^[a-h][1-8]$/;

/**
 * `shown`'s text split into words and mentions, each mention with its
 * board, from `lesson`'s guide. A move it can't place stays in the words.
 */
export function noteParts(lesson: Lesson, shown: ShownNote): NotePart[] {
  const { text } = shown.note;
  const places = lazyPlaces(lesson, shown);
  const parts: NotePart[] = [];
  let plain = '';
  let end = 0;
  for (const match of text.matchAll(MENTION)) {
    const [written, dots, bareDots, from, to, san] = match;
    const mention =
      route(written, from, to, places) ?? named(written, dots ?? bareDots, san, places);
    if (!mention) continue;
    plain += text.slice(end, match.index);
    if (plain) parts.push(plain);
    plain = '';
    parts.push(mention);
    end = match.index + written.length;
  }
  plain += text.slice(end);
  if (plain) parts.push(plain);
  return parts;
}

/** A SAN or a square, numbered or dotted or not. */
function named(
  text: string,
  dots: string | undefined,
  san: string | undefined,
  places: Places,
): Mention | undefined {
  if (!san) return undefined;
  // A bare square is a place on the board, even where a pawn could move to it.
  if (!dots && SQUARE.test(san)) {
    return { text, key: places.note, lit: [san as SquareName], kind: 'square' };
  }
  // A move number's single dot is White's move; three dots, numbered or not, Black's.
  const mover: Color | undefined =
    dots === undefined ? undefined : dots === '.' ? 'white' : 'black';
  return placed(text, places, (pos) =>
    mover && pos.turn !== mover ? undefined : sanMove(pos, san),
  );
}

/** A route written square to square, as a move. */
function route(
  text: string,
  from: string | undefined,
  to: string | undefined,
  places: Places,
): Mention | undefined {
  if (!from || !to) return undefined;
  return placed(text, places, (pos) => recordedMove(pos, `${from}${to}`));
}

/**
 * `text` as the move `find` reads in the nearest places where it reads one,
 * if they all read the same move.
 */
function placed(
  text: string,
  places: Places,
  find: (pos: Chess) => Uci | undefined,
): Mention | undefined {
  for (const tier of places.tiers()) {
    const found = tier.flatMap((pos) => {
      const uci = find(pos);
      return uci ? [{ pos, uci }] : [];
    });
    if (!found.length) continue;
    const [{ pos, uci }] = found;
    if (found.some((other) => other.uci !== uci)) return undefined;
    return played(text, pos, uci);
  }
  return undefined;
}

function played(text: string, before: Chess, uci: Uci): Mention {
  const move = parseUci(uci)!;
  const after = before.clone();
  after.play(move);
  const from = 'from' in move ? makeSquare(move.from) : undefined;
  return {
    text,
    key: positionKey(after),
    lit: from ? [from, makeSquare(move.to)] : [makeSquare(move.to)],
    kind: 'move',
  };
}

/** `san`'s move in `pos`, as the game records it, if legal and unambiguous. */
function sanMove(pos: Chess, san: string): Uci | undefined {
  const move = parseSan(pos, san);
  return move && recordedMove(pos, makeUci(move));
}

interface Places {
  /** The note's position. */
  readonly note: PositionKey;
  /** The positions a mentioned move is looked for in, nearest first, a tier at a time. */
  readonly tiers: () => Iterable<readonly Chess[]>;
}

/**
 * Where `shown`'s mentioned moves are looked for, nearest first: its
 * position (and its threats, with the threatening side to move); the
 * position its move was played in; then each ply onward along its ideas'
 * moves and the guide's, ideas first. Built only as far as a mention asks,
 * and once for all of a note's mentions.
 */
function lazyPlaces(lesson: Lesson, { note, after, before }: ShownNote): Places {
  const built: Chess[][] = [];
  const generator = tierGenerator(lesson, note.ideas ?? [], after, before);
  return {
    note: after,
    *tiers() {
      for (let n = 0; ; n++) {
        if (n === built.length) {
          const next = generator.next();
          if (next.done) return;
          built.push(next.value);
        }
        yield built[n];
      }
    },
  };
}

function* tierGenerator(
  lesson: Lesson,
  ideas: NonNullable<ShownNote['note']['ideas']>,
  after: PositionKey,
  before: PositionKey | undefined,
): Generator<Chess[]> {
  const start = readPositionKey(after);
  if (!start) return;
  // The lines the note's ideas play from its position.
  const lines = ideas.flatMap((idea) =>
    idea.type === 'line' || idea.type === 'trap' ? [idea.moves] : [],
  );
  const threats = ideas.flatMap((idea) =>
    idea.type === 'threat' && idea.side !== start.turn ? [passed(start)] : [],
  );
  yield [start, ...threats];
  const playedIn = before && readPositionKey(before);
  if (playedIn) yield [playedIn];
  // Each ply on: the ideas' lines, then the guide's moves from every position reached.
  let frontier: { pos: Chess; key: PositionKey }[] = [{ pos: start, key: after }];
  for (let ply = 1; ply <= REACH; ply++) {
    const tier: Chess[] = [];
    for (const line of lines) {
      if (line.length < ply) continue;
      const pos = start.clone();
      if (line.slice(0, ply).every((uci) => playUci(pos, uci))) tier.push(pos);
    }
    const next: typeof frontier = [];
    for (const { pos, key } of frontier) {
      for (const { uci } of lesson.positions[key]?.moves ?? []) {
        const child = pos.clone();
        if (!playUci(child, uci)) continue;
        next.push({ pos: child, key: positionKey(child) });
      }
    }
    frontier = next;
    tier.push(...next.map(({ pos }) => pos));
    if (!tier.length) return;
    yield tier;
  }
}

/** Plays `uci` on `pos` in place; false, playing nothing, if it isn't legal. */
function playUci(pos: Chess, uci: Uci): boolean {
  const move = parseUci(uci);
  if (!move || !pos.isLegal(move)) return false;
  pos.play(move);
  return true;
}

/** `pos` with the other side to move, as a threat is read when its side isn't. */
function passed(pos: Chess): Chess {
  const other = pos.clone();
  other.turn = pos.turn === 'white' ? 'black' : 'white';
  other.epSquare = undefined;
  return other;
}
