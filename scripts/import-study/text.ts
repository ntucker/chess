/**
 * Reading moves and verdicts out of the study's comment text. Move numbers in
 * the text are often off by one or two, so they only break ties (see line.ts).
 */
import { castlingSide, type Chess } from 'chessops/chess';
import type { Color, NormalMove } from 'chessops/types';
import { makeSquare, opposite, parseUci, squareFile } from 'chessops/util';

import { colorName } from '@/game/replay';
import { MAX_NOTE_WORDS, type Evaluation, type Uci } from '@/lesson/lesson';

/** One move in SAN, without annotation glyphs. */
export const SAN = String.raw`(?:O-O-O|O-O|[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h](?:x[a-h])?[1-8](?:=[QRBN])?)[+#]?`;

/** A move written in a comment, like `6...Nd7` or `...Nd7`. */
export interface NamedMove {
  readonly san: string;
  /** The ply its move number names, when it has one. */
  readonly ply?: number;
  /** Black for `...`, White for a number with one dot; unknown for bare SAN. */
  readonly side?: Color;
}

const NUMBERED = new RegExp(String.raw`(?:(\d+)\s?(\.\.\.|\.)\s?|(\.\.\.))?(${SAN})[!?]*`, 'g');

/**
 * The moves written in `text`, in order. A bare SAN takes the side after the
 * previous move, so `6.Nf3 Bg4 7.h3` is White, Black, White.
 */
export function namedMoves(text: string): NamedMove[] {
  const moves: NamedMove[] = [];
  for (const match of text.matchAll(NUMBERED)) {
    const [, number, dots, bareDots, written] = match;
    const san = plainSan(written);
    const previous = moves.at(-1);
    if (number) {
      const black = dots === '...';
      moves.push({ san, ply: plyOf(Number(number), black), side: black ? 'black' : 'white' });
    } else if (bareDots) {
      moves.push({ san, side: 'black' });
    } else {
      moves.push({
        san,
        ply: previous?.ply && previous.ply + 1,
        side: previous?.side && opposite(previous.side),
      });
    }
  }
  return moves;
}

/** The ply of move `number` by White, or by Black when `black`: 1.e4 is ply 1, 1...c6 ply 2. */
export const plyOf = (number: number, black: boolean) => 2 * number - (black ? 0 : 1);

/** `san` without check marks, so it compares with the study's own moves. */
export const plainSan = (san: string) => san.replace(/[+#!?]+$/, '');

/** A word that is a move, numbered or not, with any glyph or punctuation after it. */
const MOVE_WORD = new RegExp(String.raw`^(?:\d+\s?(?:\.\.\.|\.)|\.\.\.)?${SAN}[!?.,;:)]*$`);

/**
 * Where each sentence of `text` ends (the index after its punctuation). Chess
 * punctuation is not an end: a move number before its move (`4. Nf3`,
 * `15... Bxc6`), or a glyph on a move (`5.e6? fxe6`) unless a new sentence
 * starts after it (`Play Nf3! Black is stuck.`) and the move doesn't open its own.
 */
export function sentenceEnds(text: string): number[] {
  const ends: number[] = [];
  for (const match of text.matchAll(/(\S*?)([.!?]+)(?=\s|$)/g)) {
    const [, word, marks] = match;
    const end = match.index + match[0].length;
    const next = text.slice(end).trimStart().split(/\s/, 1)[0];
    const nextIsMove = next.startsWith('...') || MOVE_WORD.test(next);
    const moveNumber = /^\d+$/.test(word) && marks.startsWith('.') && nextIsMove;
    // A move that opens its sentence (`Ng3!? White wants…`, `12. Nf3! Black…`) heads it; it doesn't end it.
    const opensSentence = text
      .slice(ends.at(-1) ?? 0, match.index)
      .split(/\s+/)
      .every(
        (before) => before === '' || /^(?:\d+\.*|\.\.\.)$/.test(before) || MOVE_WORD.test(before),
      );
    const newSentence = /^[A-Z]/.test(next) && !nextIsMove && !opensSentence;
    const glyph = !marks.includes('.') && MOVE_WORD.test(word) && !newSentence;
    if (!moveNumber && !glyph) ends.push(end);
  }
  return ends;
}

/**
 * `text` as a note's sentence: its first sentence, cut to the word limit.
 * A placeholder until the AI step rewrites it; the whole comment stays in
 * the note's `original`.
 */
export function shorten(text: string): string {
  const trimmed = text.trim();
  const sentence = trimmed.slice(0, sentenceEnds(trimmed)[0] ?? trimmed.length);
  const words = sentence.split(/\s+/).filter(Boolean);
  return words.length <= MAX_NOTE_WORDS
    ? words.join(' ')
    : `${words.slice(0, MAX_NOTE_WORDS).join(' ')}…`;
}

/**
 * `side` doing `phrase` (written for one side: "is losing", "drops a piece"),
 * spoken to the learner as "you": "Black is losing", or "you are losing".
 * Its conjugation only knows the verbs of the trap formats (is, gets, drops,
 * loses), not free text: "has" would become "ha".
 */
export function sideDoes(side: Color, learner: Color, phrase: string): string {
  if (side !== learner) return `${colorName(side)} ${phrase}`;
  return `you ${phrase.replace(/^is\b/, 'are').replace(/^(\w+)s\b/, '$1')}`;
}

/**
 * `uci`, played in `pos`, in words to open a sentence without notation:
 * "Taking on d4 with the knight", "Checking with the queen on a5", "Pushing
 * the pawn to c4", "Taking on d8 with the pawn and promoting to a queen,
 * giving check".
 */
export function moveInWords(pos: Chess, uci: Uci): string {
  const move = parseUci(uci) as NormalMove;
  const piece = pos.board.getRole(move.from)!;
  const square = makeSquare(move.to);
  const castles = castlingSide(pos, move);
  const capture =
    !castles &&
    (pos.board.occupied.has(move.to) ||
      (piece === 'pawn' && squareFile(move.to) !== squareFile(move.from)));
  const after = pos.clone();
  after.play(move);
  const mate = after.isCheckmate();
  const check = after.isCheck();
  if (check && !castles && !move.promotion && !capture) {
    return `${mate ? 'Mating' : 'Checking'} with the ${piece} on ${square}`;
  }
  const moved = castles
    ? `Castling ${castles === 'h' ? 'short' : 'long'}`
    : capture
      ? `Taking on ${square} with the ${piece}`
      : piece === 'pawn'
        ? `Pushing the pawn to ${square}`
        : `Moving the ${piece} to ${square}`;
  const promoted = move.promotion ? ` and promoting to a ${move.promotion}` : '';
  return `${moved}${promoted}${check ? `, giving ${mate ? 'mate' : 'check'}` : ''}`;
}

/** Who a verdict favors: the evaluation's direction. */
type Direction = 'equal' | Color;

export function direction(value: Evaluation): Direction {
  if (value === 'equal') return 'equal';
  return value.startsWith('white') ? 'white' : 'black';
}

const SIDE = String.raw`(White|Black|You|you)`;
/** "White is (up to two words, not "not") better": `words` is the last word's alternatives. */
const stands = (words: string) =>
  new RegExp(String.raw`\b${SIDE} (?:is|are|stands?) (?:(?!not\b)\w+ ){0,2}(?:${words})\b`, 'g');
const VERDICTS: readonly [RegExp, (side: Color) => Direction][] = [
  [stands('better|winning'), (side) => side],
  [stands('worse|losing|lost'), (side) => opposite(side)],
  [
    new RegExp(
      String.raw`\b${SIDE} keeps? (?:a|the) (?:small|slight) (?:edge|plus|advantage)\b`,
      'g',
    ),
    (side) => side,
  ],
  [new RegExp(String.raw`\bsmall ${SIDE} edge\b`, 'g'), (side) => side],
  [
    /\b(?:position|game|line|it) is (?:\w+ )?(?:equal|level|balanced)\b|\b(?:roughly|dead|about|completely) (?:equal|level)\b|\bequal position\b/g,
    () => 'equal',
  ],
];

/** The directions of the verdicts `text` states, reading "you" as `learner`. */
export function textVerdicts(text: string, learner: Color): Set<Direction> {
  const found = new Set<Direction>();
  for (const [pattern, judge] of VERDICTS) {
    for (const match of text.matchAll(pattern)) {
      const word = match[1]?.toLowerCase();
      const side: Color = word === 'you' ? learner : word === 'black' ? 'black' : 'white';
      found.add(judge(side));
    }
  }
  return found;
}
