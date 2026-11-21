/**
 * The moves and squares a note's text names, each with the board it stands
 * for, so the idea card can show a small board for it. A square ("the e5
 * pawn", "takes on d4") is shown lit in the note's position. A move ("Bf5",
 * "...e5", "O-O", "a4-a5") is shown played from the nearest position where
 * it is legal, looking a tier at a time: the note's own position (with a
 * threat's side to move there), the position its move was played in, then
 * each ply onward along its line or trap and the guide. Where one tier's
 * positions read it as different moves, or none within reach has it, the
 * text stays plain: a guess shown as fact misleads. So does a move read for
 * the side to move in the note's position that the other side could make
 * there too: a note often names either side's moves without dots.
 */
import type { Chess } from 'chessops/chess';
import type { Color, SquareName } from 'chessops/types';
import { opposite, parseSquare } from 'chessops/util';

import {
  MOVE_NUMBER,
  playLine,
  playMove,
  positionKey,
  readPositionKey,
  recordedMove,
  SAN,
  sanToUci,
  withTurn,
} from '@/game/replay';

import type { Idea, Lesson, PositionKey, Uci } from './lesson';
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
 * A mention as text writes it. Groups: a move number (whose dots say whose
 * move) or bare `...`; a route's squares (`a4-a5`); or the SAN. Never inside
 * a word, a file's name (`c-file`) or a longer route.
 */
const MENTION = new RegExp(
  String.raw`(?<![\w.-])(${MOVE_NUMBER}|\.\.\.)?(?:([a-h][1-8])-([a-h][1-8])|(${SAN}))[!?]*(?![\w-])`,
  'g',
);

/**
 * `shown`'s text split into words and mentions, each mention with its
 * board, from `lesson`'s guide. A move it can't place stays in the words.
 */
export function noteParts(lesson: Lesson, shown: ShownNote): NotePart[] {
  const { text } = shown.note;
  const places = notePlaces(lesson, shown);
  const parts: NotePart[] = [];
  let end = 0;
  for (const match of text.matchAll(MENTION)) {
    const [written, number, from, to, san] = match;
    const mention = from
      ? placed(written, places, (pos) => recordedMove(pos, `${from}${to}`))
      : named(written, number, san, places);
    if (!mention) continue;
    if (match.index > end) parts.push(text.slice(end, match.index));
    parts.push(mention);
    end = match.index + written.length;
  }
  if (end < text.length) parts.push(text.slice(end));
  return parts;
}

/** A SAN or a square, numbered or dotted or not. */
function named(
  text: string,
  number: string | undefined,
  san: string,
  places: Places,
): Mention | undefined {
  // A bare square is a place on the board, even where a pawn could move to it.
  if (!number && parseSquare(san) !== undefined) {
    return { text, key: places.note, lit: [san as SquareName], kind: 'square' };
  }
  // Three dots, numbered or not, are Black's move; a number's single dot, White's.
  const mover: Color | undefined =
    number === undefined ? undefined : number.includes('...') ? 'black' : 'white';
  return placed(text, places, (pos) =>
    mover && pos.turn !== mover ? undefined : sanToUci(pos, san),
  );
}

/**
 * `text` as the move `find` reads in the nearest tier of `places` where it
 * reads one, if every position there, and every witness, reads the same move.
 */
function placed(
  text: string,
  places: Places,
  find: (pos: Chess) => Uci | undefined,
): Mention | undefined {
  for (const { positions, witnesses } of places.tiers()) {
    const readings = positions.map(find);
    const uci = readings.find(Boolean);
    if (!uci) continue;
    if ([...readings, ...witnesses.map(find)].some((other) => other && other !== uci)) {
      return undefined;
    }
    return played(text, positions[readings.indexOf(uci)], uci);
  }
  return undefined;
}

function played(text: string, before: Chess, uci: Uci): Mention {
  const after = before.clone();
  const { from, to } = playMove(after, uci)!;
  return { text, key: positionKey(after), lit: [from, to] as SquareName[], kind: 'move' };
}

/** One step outward of where a mentioned move is looked for. */
interface Tier {
  /** Positions a move may be read in, the likeliest first. */
  readonly positions: readonly Chess[];
  /** Positions where a different reading only makes the mention unplaceable. */
  readonly witnesses: readonly Chess[];
}

interface Places {
  /** The note's position. */
  readonly note: PositionKey;
  /** The tiers, nearest first; built only as far as a mention asks, once for all of a note's. */
  readonly tiers: () => Iterable<Tier>;
}

function notePlaces(lesson: Lesson, { note, after, before }: ShownNote): Places {
  const built: Tier[] = [];
  const generator = tiers(lesson, note.ideas ?? [], after, before);
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

/**
 * Where a note's mentioned moves are looked for, nearest first: its
 * position; the position its move was played in; then each ply onward.
 */
function* tiers(
  lesson: Lesson,
  ideas: readonly Idea[],
  after: PositionKey,
  before: PositionKey | undefined,
): Generator<Tier> {
  const start = readPositionKey(after);
  if (!start) return;
  // The other side to move: where a note's threat is read, else a witness.
  const passed = withTurn(start, opposite(start.turn));
  const threatened = ideas.some((idea) => idea.type === 'threat' && idea.side === passed.turn);
  yield threatened
    ? { positions: [start, passed], witnesses: [] }
    : { positions: [start], witnesses: [passed] };
  const playedIn = before && readPositionKey(before);
  if (playedIn) yield { positions: [playedIn], witnesses: [] };
  const lines = ideaLines(ideas, start);
  const guide = guidePlies(lesson, start, after);
  for (let ply = 1; ply <= REACH; ply++) {
    const positions = [
      ...lines.flatMap((line) => (line[ply] ? [line[ply]] : [])),
      ...(guide.next().value ?? []),
    ];
    if (!positions.length) return;
    yield { positions, witnesses: [] };
  }
}

/** Each line or trap the note's ideas play from `start`, as its positions: index n after n moves. */
function ideaLines(ideas: readonly Idea[], start: Chess): Chess[][] {
  return ideas.flatMap((idea) =>
    idea.type === 'line' || idea.type === 'trap'
      ? [Array.from(playLine(idea.moves.slice(0, REACH), start.clone()), ({ pos }) => pos.clone())]
      : [],
  );
}

/** The positions the guide's moves reach from `start`, a ply at a time, each once. */
function* guidePlies(lesson: Lesson, start: Chess, key: PositionKey): Generator<Chess[]> {
  const seen = new Set([key]);
  let frontier = [{ pos: start, key }];
  while (frontier.length) {
    const next: typeof frontier = [];
    for (const { pos, key: at } of frontier) {
      for (const { uci } of lesson.positions[at]?.moves ?? []) {
        const child = pos.clone();
        if (!playMove(child, uci)) continue;
        const childKey = positionKey(child);
        if (seen.has(childKey)) continue;
        seen.add(childKey);
        next.push({ pos: child, key: childKey });
      }
    }
    frontier = next;
    yield next.map(({ pos }) => pos);
  }
}
