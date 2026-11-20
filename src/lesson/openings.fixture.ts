// For tests only: small lessons standing in for the shipped ones, and their
// index. Tests of the openings page read this index, not the shipped one,
// so a new lesson that shares first moves with another changes none of them.
import type { Color } from '@/game/replay';
import type { LessonId } from '@/resources/lesson';

import type { Lesson, LessonMove, VariationId } from './lesson';
import { keyAfter, SAMPLE, uci, uciLine } from './lesson.fixture';
import { type LessonIndex, lessonIndex } from './openings';
import { lineKeys } from './select';

/** A lesson of `side` whose guide plays each of `lines` (in SAN) and nothing else, its learner's moves all book. */
export function guideLesson(id: string, side: Color, ...lines: string[][]): Lesson {
  const positions: Record<string, { variation: string; moves: LessonMove[] }> = {};
  for (const sans of lines) {
    sans.forEach((san, n) => {
      const key = keyAfter(...sans.slice(0, n));
      const here = (positions[key] ??= { variation: id, moves: [] });
      const learner = (n % 2 === 0) === (side === 'white');
      const played = uci(...sans.slice(0, n + 1));
      if (!here.moves.some((move) => move.uci === played))
        here.moves.push({ uci: played, ...(learner && { book: true }) });
    });
  }
  return {
    ...SAMPLE,
    id,
    side,
    variations: { [id]: { name: id } },
    positions,
  };
}

/**
 * `lesson` with a variation `id` named `name`, branching from the variation
 * of the position after `sans`: it takes that position and every position
 * the guide reaches from it.
 */
function withVariation(
  lesson: Lesson,
  id: VariationId,
  name: string,
  sans: readonly string[],
): Lesson {
  const positions = { ...lesson.positions };
  const parent = positions[keyAfter(...sans)].variation;
  const lines = [uciLine(...sans)];
  for (let line = lines.pop(); line; line = lines.pop()) {
    const key = lineKeys(line).at(-1)!;
    const here = positions[key];
    if (!here || here.variation === id) continue;
    positions[key] = { ...here, variation: id };
    lines.push(...here.moves.map(({ uci }) => [...line, uci]));
  }
  return { ...lesson, variations: { ...lesson.variations, [id]: { name, parent } }, positions };
}

/**
 * Stand-ins for the shipped lessons of the same ids: the Caro-Kann sample
 * (1.e4), the Slav (1.d4 d5 2.c4) and the anti-London (1.d4 d5 2.Bf4 or
 * 2.Nf3) for Black, sharing 1.d4 d5, and the London (1.d4) for White.
 * The London and the anti-London each have a `main-line` variation.
 */
export const FIXTURE_LESSONS = {
  'caro-kann': { ...SAMPLE, id: 'caro-kann', title: 'Caro-Kann Defence' },
  slav: {
    ...withVariation(
      guideLesson(
        'slav',
        'black',
        ['d4', 'd5', 'c4', 'c6', 'Nf3', 'Nf6', 'Nc3', 'e6', 'e3', 'Nbd7'],
        ['d4', 'd5', 'c4', 'c6', 'Nc3', 'Nf6', 'Nf3', 'dxc4'],
      ),
      'semi-slav',
      'Semi-Slav Defence',
      ['d4', 'd5', 'c4', 'c6', 'Nf3', 'Nf6', 'Nc3', 'e6'],
    ),
    title: 'Slav Defence',
  },
  'anti-london': {
    ...withVariation(
      guideLesson(
        'anti-london',
        'black',
        ['d4', 'd5', 'Bf4', 'c5', 'e3', 'Nc6'],
        ['d4', 'd5', 'Nf3', 'Nf6', 'Bf4', 'c5'],
      ),
      'main-line',
      'Main Line',
      ['d4', 'd5', 'Bf4', 'c5'],
    ),
    title: 'Anti-London',
  },
  london: {
    ...withVariation(
      guideLesson('london', 'white', ['d4', 'd5', 'Bf4', 'Nf6', 'e3'], ['d4', 'Nf6', 'Bf4', 'd5']),
      'main-line',
      'Main Line',
      ['d4', 'd5', 'Bf4'],
    ),
    title: 'London System',
  },
} satisfies Record<string, Lesson>;

/**
 * The index of `FIXTURE_LESSONS`, for `LessonIndexContext` in tests. It has
 * only their ids, typed as the shipped index for the hooks that read it.
 */
export const FIXTURE_INDEX = lessonIndex(Object.values(FIXTURE_LESSONS)) as LessonIndex<LessonId>;
