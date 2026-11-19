import { describe, expect, it } from '@jest/globals';

import { type LessonProgress, positionHash } from '@/progress/progress';

import type { Lesson, LessonMove, PositionKey } from './lesson';
import { keyAfter, SAMPLE, uciLine, withMoves } from './lesson.fixture';
import { earnedMark, rowMarks } from './marks';
import { lessonView } from './view';

/** A move after `sans`, written in SAN, as the guide stores it. */
const move = (sans: string[], san: string, book = false): LessonMove => ({
  uci: uciLine(...sans, san).at(-1)!,
  ...(book && { book: true }),
});

/**
 * A small Black repertoire. After 1.e4 the book move is ...c6; ...e5 is the
 * study's side line. After 1.e4 c6, White's d4 ends a line at once, and Nc3
 * goes on to the book ...d5, which ends one. After ...e5, Nf3 ends one too.
 */
const at = (...sans: string[]) => keyAfter(...sans);
const START = keyAfter();
const positions: Record<PositionKey, LessonMove[]> = {
  [START]: [move([], 'e4')],
  [at('e4')]: [move(['e4'], 'c6', true), move(['e4'], 'e5')],
  [at('e4', 'c6')]: [move(['e4', 'c6'], 'd4'), move(['e4', 'c6'], 'Nc3')],
  [at('e4', 'c6', 'Nc3')]: [move(['e4', 'c6', 'Nc3'], 'd5', true)],
  [at('e4', 'e5')]: [move(['e4', 'e5'], 'Nf3')],
};
const LESSON: Lesson = {
  ...SAMPLE,
  side: 'black',
  positions: Object.fromEntries(
    Object.entries(positions).map(([key, moves]) => [
      key,
      { variation: SAMPLE.positions[START].variation, moves },
    ]),
  ),
};

const ENDS = {
  d4: at('e4', 'c6', 'd4'),
  d5: at('e4', 'c6', 'Nc3', 'd5'),
  nf3: at('e4', 'e5', 'Nf3'),
};

const progress = (seen: PositionKey[], passed: PositionKey[]): LessonProgress => ({
  seen: seen.map(positionHash),
  passed: passed.map(positionHash),
});

/** The marks of `lesson`'s rows after `sans`, by SAN. */
function marksAfter(lessonProgress: LessonProgress, lesson: Lesson, ...sans: string[]) {
  const line = uciLine(...sans);
  const view = lessonView({ lesson, line, ply: line.length, opponent: 1500 });
  const marks = rowMarks(lesson, lessonProgress, view);
  return Object.fromEntries(view.candidates.map(({ san, move: { uci } }) => [san, marks.get(uci)]));
}

describe('earnedMark', () => {
  const practice = (clean: boolean) => ({ mode: 'practice', clean }) as const;

  it('marks any guide position Explore shows as seen', () => {
    expect(earnedMark('inside', { mode: 'explore' })).toBe('seen');
    expect(earnedMark('end', { mode: 'explore' })).toBe('seen');
    expect(earnedMark('beyond', { mode: 'explore' })).toBeUndefined();
  });

  it('marks a line end a clean Practice run reaches as passed, and nothing else', () => {
    expect(earnedMark('end', practice(true))).toBe('passed');
    expect(earnedMark('end', practice(false))).toBeUndefined();
    expect(earnedMark('inside', practice(true))).toBeUndefined();
  });
});

describe('rowMarks', () => {
  it('marks a row seen once the position its move leads to was seen', () => {
    const marks = marksAfter(progress([at('e4', 'c6')], []), LESSON, 'e4');
    expect(marks).toEqual({ c6: 'seen', e5: undefined });
  });

  it('passes a row once every line end a clean run can reach below it is passed', () => {
    expect(marksAfter(progress([], [ENDS.d5]), LESSON, 'e4', 'c6')).toEqual({
      d4: undefined,
      Nc3: 'passed',
    });
    expect(marksAfter(progress([], [ENDS.d5]), LESSON, 'e4')).toEqual({
      c6: undefined,
      e5: undefined,
    });
    expect(marksAfter(progress([], [ENDS.d5, ENDS.d4]), LESSON, 'e4')).toEqual({
      c6: 'passed',
      e5: undefined,
    });
  });

  it('never passes a learner move a clean run would not play, nor counts its line ends', () => {
    // Nf3's line end lies only below ...e5, the study's side line.
    const all = progress([at('e4', 'e5')], [ENDS.d5, ENDS.d4, ENDS.nf3]);
    expect(marksAfter(all, LESSON, 'e4')).toEqual({ c6: 'passed', e5: 'seen' });
    expect(marksAfter(progress([], [ENDS.d5, ENDS.d4]), LESSON)).toEqual({ e4: 'passed' });
  });

  it('leaves out a branch where a clean run gets stuck, with no book move to play', () => {
    const nc3 = ['e4', 'c6', 'Nc3'];
    const stuck = withMoves(LESSON, at(...nc3), () => [move(nc3, 'd5')]);
    const passed = progress([], [ENDS.d4]);
    // Nc3 leads nowhere a clean run can finish, so d4's line end alone passes ...c6.
    expect(marksAfter(passed, stuck, 'e4', 'c6')).toEqual({ d4: 'passed', Nc3: undefined });
    expect(marksAfter(passed, stuck, 'e4')).toEqual({ c6: 'passed', e5: undefined });
  });

  it('marks nothing with no progress', () => {
    expect(marksAfter(progress([], []), LESSON, 'e4')).toEqual({ c6: undefined, e5: undefined });
  });
});
