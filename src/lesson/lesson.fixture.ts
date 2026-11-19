// For tests only: shipped lessons read from disk (Jest can't run getLesson's
// import()), the sample lesson (a test fixture the app doesn't ship), and lines
// written in SAN for readability.
import { Chess } from 'chessops/chess';
import { parseUci } from 'chessops/util';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { sanToUci } from '@/game/replay';

import { type Lesson, type LessonMove, type PositionKey, readLesson, type Uci } from './lesson';
import { lineKeys } from './select';
import { lessonView, type LessonViewInput } from './view';

export const LESSON_FOLDER = join(__dirname, '../../assets/lessons');

const readLessonFile = (file: string): Lesson => readLesson(JSON.parse(readFileSync(file, 'utf8')));

/** The lesson shipped as `assets/lessons/<id>.json`. */
export const readShippedLesson = (id: string): Lesson => readLessonFile(join(LESSON_FOLDER, `${id}.json`));

/**
 * A hand-made lesson for tests: the Caro-Kann's first six moves, at least one
 * idea of each type, and invented play counts the tests rely on.
 */
export const SAMPLE = readLessonFile(join(__dirname, 'fixtures/caro-kann-sample.json'));

/** `sans` as UCI moves from the starting position, castling as the game records it. */
export function uciLine(...sans: string[]): string[] {
  const pos = Chess.default();
  return sans.map((san) => {
    const uci = sanToUci(pos, san);
    if (!uci) throw new Error(`Illegal move ${san}`);
    pos.play(parseUci(uci)!);
    return uci;
  });
}

/** `lesson` with the guide's moves at `key` changed by `edit`. */
export function withMoves(
  lesson: Lesson,
  key: PositionKey,
  edit: (moves: readonly LessonMove[]) => LessonMove[],
): Lesson {
  const entry = lesson.positions[key];
  return {
    ...lesson,
    positions: { ...lesson.positions, [key]: { ...entry, moves: edit(entry.moves) } },
  };
}

/** `lesson` with the trap whose moves are `moves` playing `edited` instead. */
export function withTrapMoves(lesson: Lesson, moves: readonly Uci[], edited: readonly Uci[]): Lesson {
  return JSON.parse(
    JSON.stringify(lesson, (_, value) =>
      value?.type === 'trap' && String(value.moves) === String(moves)
        ? { ...value, moves: edited }
        : value,
    ),
  );
}

/** The key of the position after `sans`. */
export const keyAfter = (...sans: string[]) => lineKeys(uciLine(...sans)).at(-1)!;

/** The sample's view after `sans`, against Maia 1500 unless `input` says otherwise. */
export function sampleView(sans: string[], input: Partial<LessonViewInput> = {}) {
  const line = uciLine(...sans);
  return lessonView({ lesson: SAMPLE, line, ply: line.length, opponent: 1500, ...input });
}

/** The Caro-Kann's first moves, to where White chooses a variation. */
export const MAIN = ['e4', 'c6', 'd4', 'd5'];
export const ADVANCE = [...MAIN, 'e5'];
/** White's c3 sets a trap: ...Nxe5? Nxe5 Bxd1 Bb5+ Qd7 Bxd7+ Kd8 Kxd1 wins material. */
export const TRAP = [...ADVANCE, 'c5', 'dxc5', 'Nc6', 'Nf3', 'Bg4', 'c3'];
export const TRAP_PUNISHED = [
  ...TRAP,
  'Nxe5',
  'Nxe5',
  'Bxd1',
  'Bb5+',
  'Qd7',
  'Bxd7+',
  'Kd8',
  'Kxd1',
];

/**
 * The sample with five rarely played replies at `MAIN`, making its list
 * long: f3 (fifth most played, so listed), then h3, a3, g3 and b3, which are rare.
 */
export const WITH_RARE = withMoves(SAMPLE, keyAfter(...MAIN), (moves) => [
  ...moves,
  { uci: 'f2f3', games: [3, 3, 3, 3, 3] },
  { uci: 'h2h3', games: [2, 2, 2, 2, 2] },
  ...['a2a3', 'g2g3', 'b2b3'].map((uci) => ({ uci, games: [1, 1, 1, 1, 1] })),
]);
