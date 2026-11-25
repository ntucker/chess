import { describe, expect, it } from '@jest/globals';

import { checkLesson } from '@/lesson/check';
import type { Idea, Lesson, LessonMove, LessonPosition, PositionKey } from '@/lesson/lesson';
import { keyAfter, readShippedLesson, uci, uciLine } from '@/lesson/lesson.fixture';
import { mistakeLine } from '@/lesson/mistakes';
import { lineSans, numberedLine, parsePosition, playLine, positionKey } from '@/game/replay';

import { addPathCounts, type LessonFind, withFinds } from './finds';
import { at, testLesson } from './fixture';
import { type Explorer, RATING_BANDS } from './popularity';

/** Black's lesson 1.e4 e5 2.Nf3, with `extra` positions. */
const lessonWith = (extra: Record<PositionKey, LessonPosition> = {}): Lesson => ({
  ...testLesson<Idea>({
    [keyAfter()]: at([{ uci: uci('e4') }]),
    [keyAfter('e4')]: at([{ uci: uci('e4', 'e5'), book: true }]),
    [keyAfter('e4', 'e5')]: at([{ uci: uci('e4', 'e5', 'Nf3') }]),
    ...extra,
  }),
  popularity: { ratingBands: RATING_BANDS, speeds: ['blitz'], date: '2026-11-25' },
});

/** The find 2.Ba6? bxa6 (or 2...Nxa6) 3.Nf3 Nc6, after `line`. */
const BA6: LessonFind = {
  find: {
    line: uciLine('e4', 'e5'),
    mistake: uci('e4', 'e5', 'Ba6'),
    replies: [uci('e4', 'e5', 'Ba6', 'bxa6'), uci('e4', 'e5', 'Ba6', 'Nxa6')],
    payoff: uciLine('e4', 'e5', 'Ba6', 'bxa6', 'Nf3', 'Nc6').slice(4),
    disagreements: [],
    end: 1,
    holds: true,
    reach: 0.1,
    onGuide: true,
    share: 0.2,
    cost: 0.4321,
    gain: 0.2,
    score: 0.02,
  },
  gain: [0.31234, 0.2, 0.1, 0.05, 0],
};

const movesAt = (lesson: Lesson, ...sans: string[]) => lesson.positions[keyAfter(...sans)].moves;

describe('withFinds', () => {
  it("marks the mistake, books the replies and the learner's Act III moves, and stores no line the guide gives", () => {
    const lesson = withFinds(lessonWith(), [BA6]);

    expect(movesAt(lesson, 'e4', 'e5')).toEqual([
      { uci: uci('e4', 'e5', 'Nf3') },
      { uci: uci('e4', 'e5', 'Ba6'), mistake: { cost: 0.432, gain: [0.312, 0.2, 0.1, 0.05, 0] } },
    ]);
    expect(movesAt(lesson, 'e4', 'e5', 'Ba6')).toEqual([
      { uci: uci('e4', 'e5', 'Ba6', 'bxa6'), book: true },
      { uci: uci('e4', 'e5', 'Ba6', 'Nxa6'), book: true },
    ]);
    expect(movesAt(lesson, 'e4', 'e5', 'Ba6', 'bxa6')).toEqual([
      { uci: uci('e4', 'e5', 'Ba6', 'bxa6', 'Nf3') },
    ]);
    expect(movesAt(lesson, 'e4', 'e5', 'Ba6', 'bxa6', 'Nf3')).toEqual([
      { uci: uci('e4', 'e5', 'Ba6', 'bxa6', 'Nf3', 'Nc6'), book: true },
    ]);
    const marked = movesAt(lesson, 'e4', 'e5')[1];
    expect(mistakeLine(lesson, keyAfter('e4', 'e5'), marked)).toEqual(
      uciLine('e4', 'e5', 'Ba6', 'bxa6', 'Nf3', 'Nc6').slice(2),
    );
    expect(checkLesson(lesson)).toEqual([]);
  });

  it('stores the line where Act III ends before the guide does', () => {
    // The guide already goes on past 3...Nc6 with 4.Nc3.
    const lesson = withFinds(
      lessonWith({
        [keyAfter('e4', 'e5', 'Ba6', 'bxa6', 'Nf3', 'Nc6')]: at([
          { uci: uci('e4', 'e5', 'Ba6', 'bxa6', 'Nf3', 'Nc6', 'Nc3') },
        ]),
      }),
      [BA6],
    );
    expect(movesAt(lesson, 'e4', 'e5')[1].mistake?.line).toEqual(
      uciLine('e4', 'e5', 'Ba6', 'bxa6', 'Nf3', 'Nc6').slice(3),
    );
  });

  it("adds the opponent's Act I replies the guide lacks, and refuses a learner move it lacks", () => {
    const d3: LessonFind = {
      ...BA6,
      find: {
        ...BA6.find,
        line: uciLine('e4', 'e5', 'd3', 'Nc6'),
        mistake: uci('e4', 'e5', 'd3', 'Nc6', 'Qh5'),
        replies: [uci('e4', 'e5', 'd3', 'Nc6', 'Qh5', 'Nf6')],
        payoff: [],
      },
    };
    const guided = lessonWith({
      [keyAfter('e4', 'e5', 'd3')]: at([{ uci: uci('e4', 'e5', 'd3', 'Nc6'), book: true }]),
    });
    expect(movesAt(withFinds(guided, [d3]), 'e4', 'e5').map((move) => move.uci)).toEqual([
      uci('e4', 'e5', 'Nf3'),
      uci('e4', 'e5', 'd3'),
    ]);
    expect(() => withFinds(lessonWith(), [d3])).toThrow('which the guide lacks there');
  });

  it('only measures a mistake the guide already marks, keeping its line and verdict', () => {
    const marked: LessonMove = {
      uci: uci('e4', 'e5', 'Ba6'),
      mistake: { verdict: 'losesMaterial' },
    };
    const lesson = lessonWith({
      [keyAfter('e4', 'e5', 'Ba6')]: at([{ uci: uci('e4', 'e5', 'Ba6', 'Nxa6'), book: true }]),
    });
    const withMark = {
      ...lesson,
      positions: {
        ...lesson.positions,
        [keyAfter('e4', 'e5')]: at([{ uci: uci('e4', 'e5', 'Nf3') }, marked]),
      },
    };
    const measured = withFinds(withMark, [BA6]);
    expect(movesAt(measured, 'e4', 'e5')[1].mistake).toEqual({
      verdict: 'losesMaterial',
      cost: 0.432,
      gain: [0.312, 0.2, 0.1, 0.05, 0],
    });
    expect(movesAt(measured, 'e4', 'e5', 'Ba6')).toEqual(movesAt(withMark, 'e4', 'e5', 'Ba6'));
  });
});

describe('addPathCounts', () => {
  it("writes one answer's counts and total on each position of a find's path", async () => {
    const lesson = withFinds(lessonWith(), [BA6]);
    const asked: string[] = [];
    const explorer: Explorer = async (key, band, options) => {
      asked.push(`${band} ${key} ${options?.total}`);
      return { counts: { [uci('e4', 'e5', 'Ba6', 'bxa6')]: band, e2e4: band }, total: band * 3 };
    };
    const counted = await addPathCounts(lesson, [BA6], explorer);

    const cue = counted.positions[keyAfter('e4', 'e5', 'Ba6')];
    expect(cue.games).toEqual([3000, 3600, 4200, 4800, 5400]);
    expect(cue.moves.map((move) => move.games)).toEqual([
      [1000, 1200, 1400, 1600, 1800],
      [0, 0, 0, 0, 0],
    ]);
    // Every position a path move is played in: 1.e4's, 1...e5's, 2.Ba6's, 2...bxa6's, 3.Nf3's and 3...Nc6's.
    expect(asked).toHaveLength(6 * RATING_BANDS.length);
    expect(asked.every((request) => request.endsWith('true'))).toBe(true);
    expect(counted.positions[keyAfter('e4', 'e5', 'Ba6', 'bxa6', 'Nf3', 'Nc6')]).toBeUndefined();
  });

  it('counts only the positions of the tree where the guide already marked the mistake', async () => {
    const lesson = lessonWith({
      [keyAfter('e4', 'e5')]: at([
        { uci: uci('e4', 'e5', 'Nf3') },
        { uci: uci('e4', 'e5', 'Ba6'), mistake: { verdict: 'losesMaterial' } },
      ]),
    });
    const asked = new Set<string>();
    const explorer: Explorer = async (key) => {
      asked.add(key);
      return { counts: {}, total: 0 };
    };
    // The guide's line ends at 2.Ba6, so the find's own path past it is not in the tree.
    await addPathCounts(withFinds(lesson, [BA6]), [BA6], explorer);
    expect([...asked].sort()).toEqual([keyAfter(), keyAfter('e4'), keyAfter('e4', 'e5')].sort());
  });
});

describe('the Stafford lesson', () => {
  // Piece B's report rows for the 1400 band (yarn opportunities stafford): a rebuild whose finds drift fails here.
  it("marks the finds of the opportunities report's 1400 band, and no other move", () => {
    const lesson = readShippedLesson('stafford');
    const start = parsePosition(lesson.start)!;
    const lines = new Map<PositionKey, string[]>([[positionKey(start), []]]);
    const marked: string[] = [];
    // Breadth-first over the tree, naming each marked move by its line from the start.
    for (const [key, line] of lines) {
      for (const move of lesson.positions[key]?.moves ?? []) {
        const moves = [...line, move.uci];
        const next = [...playLine(moves, start.clone())].at(-1)!.key;
        if (!lines.has(next)) lines.set(next, moves);
        if (move.mistake) marked.push(numberedLine(lineSans(moves, start)));
      }
    }
    expect(marked.sort()).toEqual(
      [
        '1.e4 e5 2.Nf3 Nf6 3.Nxe5 Nc6 4.Nxc6 dxc6 5.Nc3 Bc5 6.d3',
        '1.e4 e5 2.Nf3 Nf6 3.Nxe5 Nc6 4.Nxc6 dxc6 5.Nc3 Bc5 6.Bc4',
        '1.e4 e5 2.Nf3 Nf6 3.Nxe5 Nc6 4.Nxc6 dxc6 5.d3 Bc5 6.Bg5',
        '1.e4 e5 2.Nf3 Nf6 3.Nxe5 Nc6 4.Nxc6 dxc6 5.e5 Ne4 6.d3',
        '1.e4 e5 2.Nf3 Nf6 3.Nxe5 Nc6 4.Nxc6 dxc6 5.d3 Bc5 6.Be2 h5 7.O-O',
        '1.e4 e5 2.Nf3 Nf6 3.Nxe5 Nc6 4.Nxc6 dxc6 5.d3 Bc5 6.Be2 h5 7.Bg5',
        '1.e4 e5 2.Nf3 Nf6 3.Nxe5 Nc6 4.Nxc6 dxc6 5.d3 Bc5 6.h3 Bxf2+ 7.Kxf2 Nxe4+ 8.Ke1',
        '1.e4 e5 2.Nf3 Nf6 3.Nxe5 Nc6 4.Nxc6 dxc6 5.e5 Ne4 6.d4 Qh4 7.g3',
        '1.e4 e5 2.Nf3 Nf6 3.Nxe5 Nc6 4.Nxc6 dxc6 5.Nc3 Bc5 6.d4',
        '1.e4 e5 2.Nf3 Nf6 3.Nxe5 Nc6 4.Nxc6 dxc6 5.e5 Ne4 6.Bc4',
      ].sort(),
    );
  });
});
