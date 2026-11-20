import { describe, expect, it } from '@jest/globals';

import { cleanLineEnds } from './cleanRun';
import type { Lesson, LessonMove, PositionKey } from './lesson';
import { keyAfter, SAMPLE, uci } from './lesson.fixture';

/** A move after `sans`, with its lichess game counts in two rating bands. */
const move = (sans: string[], san: string, games?: number[], book = false): LessonMove => ({
  uci: uci(...sans, san),
  ...(book && { book: true }),
  ...(games && { games }),
});

/** A Black lesson whose only position is after 1.e4, with White's `replies` to 1...c6. */
function lesson(replies: LessonMove[]): Lesson {
  const variation = SAMPLE.positions[keyAfter()].variation;
  const positions: Record<PositionKey, LessonMove[]> = {
    [keyAfter()]: [move([], 'e4')],
    [keyAfter('e4')]: [move(['e4'], 'c6', undefined, true)],
    [keyAfter('e4', 'c6')]: replies,
  };
  return {
    ...SAMPLE,
    side: 'black',
    positions: Object.fromEntries(
      Object.entries(positions).map(([key, moves]) => [key, { variation, moves }]),
    ),
  };
}

const ends = (replies: LessonMove[]) => cleanLineEnds(lesson(replies), keyAfter('e4')).sort();
const after = (san: string) => keyAfter('e4', 'c6', san);
const reply = (san: string, games?: number[]) => move(['e4', 'c6'], san, games);

describe('cleanLineEnds', () => {
  it("counts an opponent's reply played at least a tenth of the time, over all bands", () => {
    // d4 60%, Nc3 32%, f4 8%: 50 + 30 + 10 games against 10 + 2 + 0.
    expect(ends([reply('d4', [50, 10]), reply('Nc3', [30, 2]), reply('f4', [8, 0])])).toEqual(
      [after('d4'), after('Nc3')].sort(),
    );
  });

  it('always counts the most played reply, and one without counts', () => {
    // d4 9%, and thirteen others 7% each: none reaches a tenth, but d4 is the most played.
    const others = [
      'Nc3',
      'f4',
      'Nf3',
      'c4',
      'd3',
      'g3',
      'b3',
      'Be2',
      'Qe2',
      'h3',
      'a3',
      'c3',
      'Bc4',
    ];
    expect(ends([reply('d4', [9, 0]), ...others.map((san) => reply(san, [7, 0]))])).toEqual([
      after('d4'),
    ]);
    expect(ends([reply('d4', [95, 0]), reply('Nc3', [5, 0]), reply('f4')])).toEqual(
      [after('d4'), after('f4')].sort(),
    );
  });
});
