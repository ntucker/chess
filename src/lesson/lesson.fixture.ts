// For tests only: the shipped sample lesson, read from disk (Jest can't run
// getLesson's import()), and lines written in SAN for readability.
import { Chess } from 'chessops/chess';
import { parseSan } from 'chessops/san';
import { makeUci } from 'chessops/util';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { recordedMove } from '@/game/replay';

import { type Lesson, readLesson } from './lesson';

export const SAMPLE: Lesson = readLesson(
  JSON.parse(readFileSync(join(__dirname, '../../assets/lessons/caro-kann-sample.json'), 'utf8')),
);

/** `sans` as UCI moves from the starting position, castling as the game records it. */
export function uciLine(...sans: string[]): string[] {
  const pos = Chess.default();
  return sans.map((san) => {
    const move = parseSan(pos, san);
    if (!move) throw new Error(`Illegal move ${san}`);
    const uci = recordedMove(pos, makeUci(move))!;
    pos.play(move);
    return uci;
  });
}

/** The first moves of the Caro-Kann, to the position where White chooses a variation. */
export const MAIN = ['e4', 'c6', 'd4', 'd5'];
