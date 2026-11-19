/**
 * Reading moves and verdicts out of the study's comment text. Move numbers in
 * the text are often off by one or two, so they only break ties (see line.ts).
 */
import type { Color } from 'chessops/types';
import { opposite } from 'chessops/util';

import { MAX_NOTE_WORDS, type Evaluation } from '@/lesson/lesson';

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
    const [, number, dots, bareDots, san] = match;
    const previous = moves.at(-1);
    if (number) {
      const black = dots === '...';
      moves.push({ san: plainSan(san), ply: 2 * (Number(number) - 1) + (black ? 2 : 1), side: black ? 'black' : 'white' });
    } else if (bareDots) {
      moves.push({ san: plainSan(san), side: 'black' });
    } else {
      const side = previous?.side && opposite(previous.side);
      moves.push({ san: plainSan(san), ply: previous?.ply && previous.ply + 1, side });
    }
  }
  return moves;
}

/** `san` without check marks, so it compares with the study's own moves. */
export const plainSan = (san: string) => san.replace(/[+#!?]+$/, '');

/**
 * `text` as a note's sentence: its first sentence, cut to the word limit.
 * A placeholder until the AI step rewrites it; the whole comment stays in
 * the note's `original`.
 */
export function shorten(text: string): string {
  const sentence = text.trim().match(/^.+?[.!?](?=\s|$)/s)?.[0] ?? text.trim();
  const words = sentence.split(/\s+/).filter(Boolean);
  return words.length <= MAX_NOTE_WORDS ? words.join(' ') : `${words.slice(0, MAX_NOTE_WORDS).join(' ')}…`;
}

/** Who a verdict favors: the evaluation's direction. */
type Direction = 'equal' | Color;

export function direction(value: Evaluation): Direction {
  if (value === 'equal') return 'equal';
  return value.startsWith('white') ? 'white' : 'black';
}

const SIDE = String.raw`(White|Black|You|you)`;
const VERDICTS: readonly [RegExp, (side: Color) => Direction][] = [
  [new RegExp(String.raw`\b${SIDE} (?:is|are|stands?) (?:(?!not\b)\w+ ){0,2}(?:better|winning)\b`, 'g'), (side) => side],
  [new RegExp(String.raw`\b${SIDE} (?:is|are|stands?) (?:(?!not\b)\w+ ){0,2}(?:worse|losing|lost)\b`, 'g'), (side) => opposite(side)],
  [new RegExp(String.raw`\b${SIDE} keeps? (?:a|the) (?:small|slight) (?:edge|plus|advantage)\b`, 'g'), (side) => side],
  [new RegExp(String.raw`\bsmall ${SIDE} edge\b`, 'g'), (side) => side],
  [/\b(?:position|game|line|it) is (?:\w+ )?(?:equal|level|balanced)\b|\b(?:roughly|dead|about|completely) (?:equal|level)\b|\bequal position\b/g, () => 'equal'],
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
