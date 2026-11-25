import { describe, expect, it } from '@jest/globals';

import { type MarkedPositions, positionHash } from '@/progress/progress';

import type { Lesson, LessonMove, PositionKey } from './lesson';
import {
  keyAfter,
  readShippedLesson,
  SAMPLE,
  shippedIds,
  uci,
  uciLine,
  withMoves,
} from './lesson.fixture';
import { earnedMark, openingMarks, rowMarks, steering } from './marks';
import { lessonIndex, openingsLesson } from './openings';
import { lessonView } from './view';

/** A move after `sans`, written in SAN, as the guide stores it. */
const move = (sans: string[], san: string, book = false): LessonMove => ({
  uci: uci(...sans, san),
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

const progress = (seen: PositionKey[], passed: PositionKey[]): MarkedPositions => ({
  seen: seen.map(positionHash),
  passed: passed.map(positionHash),
});

/** The marks of `lesson`'s rows after `sans`, by SAN. */
function marksAfter(lessonProgress: MarkedPositions, lesson: Lesson, ...sans: string[]) {
  const line = uciLine(...sans);
  const view = lessonView({ lesson, line, ply: line.length, opponent: 1500 });
  const marks = rowMarks(lesson, lessonProgress, view);
  return Object.fromEntries(view.candidates.map(({ san, move: { uci } }) => [san, marks.get(uci)]));
}

const practice = (clean: boolean) => ({ mode: 'practice', clean, line: [] }) as const;

describe('earnedMark', () => {
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

  it('follows a line that comes back to an earlier position, whichever row asks first', () => {
    // The knights go out and back: 1.Nf3 Nf6 2.Ng1 Ng8 is the start again.
    // White's 1.e4 and the c4 after ...Nh5 end lines; ...Nh5 also comes back,
    // through 3.Nf3 Nf6, to the position after 1.Nf3 Nf6.
    const out = ['Nf3', 'Nf6', 'Ng1'];
    const h5 = [...out, 'Nh5'];
    const shuffle: Lesson = {
      ...LESSON,
      positions: Object.fromEntries(
        Object.entries({
          [START]: [move([], 'Nf3'), move([], 'e4')],
          [at('Nf3')]: [move(['Nf3'], 'Nf6', true)],
          [at('Nf3', 'Nf6')]: [move(['Nf3', 'Nf6'], 'Ng1')],
          [at(...out)]: [move(out, 'Ng8', true), move(out, 'Nh5', true)],
          [at(...h5)]: [move(h5, 'Nf3'), move(h5, 'c4')],
          [at(...h5, 'Nf3')]: [move([...h5, 'Nf3'], 'Nf6', true)],
        }).map(([key, moves]) => [key, { variation: LESSON.positions[START].variation, moves }]),
      ),
    };
    const c4 = at(...h5, 'c4');
    // ...Nh5 reaches 1.e4's open line through the start, though its walk meets c4 first.
    expect(marksAfter(progress([], [c4]), shuffle, ...out)).toEqual({
      Ng8: undefined,
      Nh5: undefined,
    });
    expect(marksAfter(progress([], [c4, at('e4')]), shuffle, ...out)).toEqual({
      Ng8: 'passed',
      Nh5: 'passed',
    });
  });

  it('answers from the passed marks each time, as they grow, stay or shrink', () => {
    const open = progress([], [ENDS.d5]);
    const passed = progress([], [ENDS.d5, ENDS.d4]);
    expect(marksAfter(open, LESSON, 'e4').c6).toBeUndefined();
    expect(marksAfter(passed, LESSON, 'e4').c6).toBe('passed');
    // A seen mark makes a new progress with the same passed marks.
    expect(marksAfter(progress([at('e4', 'c6')], [ENDS.d5, ENDS.d4]), LESSON, 'e4').c6).toBe(
      'passed',
    );
    // Another tab's save can hold fewer.
    expect(marksAfter(open, LESSON, 'e4').c6).toBeUndefined();
  });

  it('marks nothing with no progress', () => {
    expect(marksAfter(progress([], []), LESSON, 'e4')).toEqual({ c6: undefined, e5: undefined });
  });
});

describe('openingMarks', () => {
  // Two openings: LESSON after 1.e4, and one after 1.d4 whose book ...d5 ends its only line.
  const D4: Lesson = {
    ...LESSON,
    id: 'd4',
    positions: {
      [START]: { variation: LESSON.positions[START].variation, moves: [move([], 'd4')] },
      [at('d4')]: {
        variation: LESSON.positions[START].variation,
        moves: [move(['d4'], 'd5', true)],
      },
    },
  };
  const index = lessonIndex([{ ...LESSON, id: 'e4' }, D4]);
  const view = lessonView({
    lesson: openingsLesson(index, 'black'),
    line: [],
    ply: 0,
    opponent: 1500,
  });
  const marksOf = (lessonProgress: Record<string, MarkedPositions>) => {
    const marks = openingMarks(index, 'black', [], lessonProgress, view);
    return Object.fromEntries(
      view.candidates.map(({ san, move: { uci } }) => [san, marks.get(uci)]),
    );
  };

  it("marks each opening's row from its own lesson's progress", () => {
    // LESSON's progress names the position after 1.d4 too, but that row is D4's.
    expect(marksOf({ e4: progress([at('e4'), at('d4')], []) })).toEqual({
      e4: 'seen',
      d4: undefined,
    });
    expect(marksOf({ d4: progress([at('d4')], []) })).toEqual({ e4: undefined, d4: 'seen' });
  });

  it('passes a row once every line end the index lists for it is passed', () => {
    expect(marksOf({ e4: progress([at('e4')], [ENDS.d4]) })).toEqual({ e4: 'seen', d4: undefined });
    expect(
      marksOf({ e4: progress([at('e4')], [ENDS.d4, ENDS.d5]), d4: progress([], [at('d4', 'd5')]) }),
    ).toEqual({ e4: 'passed', d4: 'passed' });
  });

  it('never passes a learner first move a clean run would not play', () => {
    const white: Lesson = {
      ...LESSON,
      id: 'white',
      side: 'white',
      positions: {
        [START]: {
          variation: LESSON.positions[START].variation,
          moves: [move([], 'e4', true), move([], 'd4')],
        },
        [at('e4')]: { variation: LESSON.positions[START].variation, moves: [move(['e4'], 'e5')] },
      },
    };
    const whiteIndex = lessonIndex([white]);
    const start = lessonView({
      lesson: openingsLesson(whiteIndex, 'white'),
      line: [],
      ply: 0,
      opponent: 1500,
    });
    const marks = openingMarks(
      whiteIndex,
      'white',
      [],
      { white: progress([], [at('e4', 'e5'), at('d4')]) },
      start,
    );
    // 1.d4 isn't a book move, so a clean run never plays it.
    expect([...marks]).toEqual([[uciLine('e4')[0], 'passed']]);
  });

  it('marks a row two lessons share from both: passed once both are, seen once either is', () => {
    // Two lessons after 1.d4 d5: one picked by 2.Nf3, the other by 2.c4, each ending there.
    const after = (id: string, san: string): Lesson => ({
      ...D4,
      id,
      positions: {
        ...D4.positions,
        [at('d4', 'd5')]: {
          variation: LESSON.positions[START].variation,
          moves: [move(['d4', 'd5'], san)],
        },
      },
    });
    const NF3 = after('nf3', 'Nf3');
    const C4 = after('c4', 'c4');
    const shared = lessonIndex([NF3, C4]);
    const start = lessonView({
      lesson: openingsLesson(shared, 'black'),
      line: [],
      ply: 0,
      opponent: 1500,
    });
    const d4 = (lessonProgress: Record<string, MarkedPositions>) =>
      openingMarks(shared, 'black', [], lessonProgress, start).get(uciLine('d4')[0]);
    // Seen where a line picks its lesson: the shared moves before earn no marks.
    expect(d4({ c4: progress([at('d4', 'd5', 'c4')], []) })).toBe('seen');
    expect(d4({ nf3: progress([], [at('d4', 'd5', 'Nf3')]) })).toBeUndefined();
    expect(
      d4({
        nf3: progress([], [at('d4', 'd5', 'Nf3')]),
        c4: progress([], [at('d4', 'd5', 'c4')]),
      }),
    ).toBe('passed');
  });

  it('marks nothing for a lesson never played', () => {
    expect(marksOf({})).toEqual({ e4: undefined, d4: undefined });
  });

  it.each(shippedIds)("agrees with walking %s's own start, however much is passed", (id) => {
    const lesson = readShippedLesson(id);
    const start = lessonView({ lesson, line: [], ply: 0, opponent: 1500 });
    const own = lessonIndex([lesson]);
    const ends = own[id].lines.flatMap(({ lineEnds }) => lineEnds);
    // Every other end, all but one, all, and all plus one that isn't an end.
    const passedLists = [
      [],
      ends.filter((_, i) => i % 2 === 0),
      ends.slice(1),
      ends,
      [...ends, positionHash(START)],
    ];
    for (const passed of passedLists) {
      const lessonProgress = { seen: [], passed };
      expect(openingMarks(own, lesson.side, [], { [id]: lessonProgress }, start)).toEqual(
        rowMarks(lesson, lessonProgress, start),
      );
    }
  });
});

describe('steering', () => {
  // After 1.e4 c6 White's replies are d4 (a line end) and Nc3 (on to ...d5's end), in that order.
  const line = uciLine('e4', 'c6');
  const { candidates } = lessonView({ lesson: LESSON, line, ply: line.length, opponent: 1500 });
  const reply = (passed: PositionKey[]) =>
    steering(LESSON, progress([], passed), practice(true))!(candidates, at('e4', 'c6'))?.san;

  it('plays the most played reply below which a line end is still to pass', () => {
    expect(reply([])).toBe('d4');
    expect(reply([ENDS.d4])).toBe('Nc3');
    expect(reply([ENDS.d5])).toBe('d4');
  });

  it('plays the most played reply once every line below is passed', () => {
    expect(reply([ENDS.d4, ENDS.d5])).toBe('d4');
  });

  it("never steers to a reply too rare to count, which the row's passed mark leaves out", () => {
    // d4 played 92%, Nc3 8%: only d4's line counts, so passing it passes 1...c6.
    const games = {
      [uciLine('e4', 'c6', 'd4')[2]]: [92, 0],
      [uciLine('e4', 'c6', 'Nc3')[2]]: [8, 0],
    };
    const rare = withMoves(LESSON, at('e4', 'c6'), (moves) =>
      moves.map((move) => ({ ...move, games: games[move.uci] })),
    );
    const done = progress([], [ENDS.d4]);
    expect(marksAfter(done, rare, 'e4')).toEqual({ c6: 'passed', e5: undefined });
    const { candidates: replies } = lessonView({ lesson: rare, line, ply: 2, opponent: 1500 });
    expect(steering(rare, done, practice(true))!(replies, at('e4', 'c6'))?.san).toBe('d4');
  });

  it('plays the first reply that counts once every counted line is passed', () => {
    // Nc3 leads the 1400 band's list, but over all bands it is under a tenth.
    const games = {
      [uciLine('e4', 'c6', 'd4')[2]]: [0, 0, 0, 0, 100],
      [uciLine('e4', 'c6', 'Nc3')[2]]: [0, 0, 5, 0, 0],
    };
    const lesson = withMoves(LESSON, at('e4', 'c6'), (moves) =>
      moves.map((move) => ({ ...move, games: games[move.uci] })),
    );
    const { candidates: replies } = lessonView({ lesson, line, ply: 2, opponent: 1500 });
    expect(replies.map(({ san }) => san)).toEqual(['Nc3', 'd4']);
    expect(
      steering(lesson, progress([], [ENDS.d4]), practice(true))!(replies, at('e4', 'c6'))?.san,
    ).toBe('d4');
  });

  it('steers only a clean Practice run, which alone can pass a line', () => {
    const done = progress([], [ENDS.d4]);
    expect(steering(LESSON, done, { mode: 'explore' })).toBeUndefined();
    expect(steering(LESSON, done, practice(false))).toBeUndefined();
  });
});
