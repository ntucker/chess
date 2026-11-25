import { describe, expect, it } from '@jest/globals';

import { type MarkedPositions, positionHash } from '@/progress/progress';

import type { Lesson, LessonMove, Mistake, PositionKey } from './lesson';
import { keyAfter, readShippedLesson, SAMPLE, uci, uciLine } from './lesson.fixture';
import { opportunityMarks } from './marks';
import { lessonOpportunities, listsAnyOpportunity } from './opportunities';

/** A move after `sans`, written in SAN, played in `games` games of the one band. */
const move = (sans: string[], san: string, games: number, extra: Partial<LessonMove> = {}) => ({
  uci: uci(...sans, san),
  games: [games],
  ...extra,
});
const mistake = (fields: Mistake) => ({ mistake: fields });

/**
 * A small Black repertoire, one band of counts. After 1.e4 e5, 40 of 100
 * games play the marked 2.Qh5 (gain 0.5); after 2.Nf3 Nc6, 10 of 100 play
 * the marked 3.Nxe5 (gain 0.2), so 0.6 × 0.1 × 0.2 ranks under 0.4 × 0.5.
 * The book's 2...Nc6 answers 2.Qh5 and ends a line.
 * After 1.d4 d5, the marked 2.c4 has no gain yet: a trap from a guide.
 */
const at = (...sans: string[]) => keyAfter(...sans);
const positions: Record<PositionKey, { moves: LessonMove[]; games: number[] }> = {
  [at()]: { moves: [move([], 'e4', 100), move([], 'd4', 100)], games: [200] },
  [at('e4')]: { moves: [move(['e4'], 'e5', 100, { book: true })], games: [100] },
  [at('e4', 'e5')]: {
    moves: [
      move(['e4', 'e5'], 'Nf3', 60),
      move(['e4', 'e5'], 'Qh5', 40, mistake({ gain: [0.5], cost: 0.3 })),
    ],
    games: [100],
  },
  [at('e4', 'e5', 'Qh5')]: {
    moves: [move(['e4', 'e5', 'Qh5'], 'Nc6', 30, { book: true })],
    games: [40],
  },
  [at('e4', 'e5', 'Qh5', 'Nc6')]: { moves: [], games: [30] },
  [at('e4', 'e5', 'Nf3')]: {
    moves: [move(['e4', 'e5', 'Nf3'], 'Nc6', 60, { book: true })],
    games: [60],
  },
  [at('e4', 'e5', 'Nf3', 'Nc6')]: {
    moves: [
      move(['e4', 'e5', 'Nf3', 'Nc6'], 'Bc4', 90),
      move(['e4', 'e5', 'Nf3', 'Nc6'], 'Nxe5', 10, mistake({ gain: [0.2], cost: 0.25 })),
    ],
    games: [100],
  },
  [at('d4')]: { moves: [move(['d4'], 'd5', 100, { book: true })], games: [100] },
  [at('d4', 'd5')]: {
    moves: [move(['d4', 'd5'], 'c4', 50, mistake({ verdict: 'losesMaterial' }))],
    games: [100],
  },
};
const variation = SAMPLE.positions[at()].variation;
const LESSON: Lesson = {
  ...SAMPLE,
  side: 'black',
  popularity: { ratingBands: [1400], speeds: [], date: '2026-11-25' },
  positions: Object.fromEntries(
    Object.entries(positions).map(([key, entry]) => [key, { variation, ...entry }]),
  ),
};

describe('lessonOpportunities', () => {
  const list = lessonOpportunities(LESSON, 0);

  it("ranks by the cue's reach × gain, the unscored after", () => {
    expect(list.map(({ san }) => san)).toEqual(['Qh5', 'Nxe5', 'c4']);
    const [qh5, nxe5, c4] = list;
    expect(qh5).toMatchObject({ reach: 0.5, share: 0.4, score: 0.5 * 0.4 * 0.5 });
    expect(nxe5.reach).toBeCloseTo(0.5 * 0.6);
    expect(nxe5.score).toBeCloseTo(0.3 * 0.1 * 0.2);
    expect(c4.score).toBeUndefined();
  });

  it('gives each the line into it from the start, then the mistake, and its cue', () => {
    const [qh5, nxe5] = list;
    expect(qh5.line).toEqual(uciLine('e4', 'e5', 'Qh5'));
    expect(nxe5.line).toEqual(uciLine('e4', 'e5', 'Nf3', 'Nc6', 'Nxe5'));
    expect(qh5.next).toBe(at('e4', 'e5', 'Qh5'));
  });

  it('leaves the reach, shares and scores out without a band', () => {
    const unbanded = lessonOpportunities(LESSON, undefined);
    expect(unbanded).toHaveLength(3);
    expect(
      unbanded.every(
        ({ reach, share, score }) =>
          reach === undefined && share === undefined && score === undefined,
      ),
    ).toBe(true);
  });

  it("lists none of the learner's own mistakes", () => {
    expect(listsAnyOpportunity(LESSON)).toBe(true);
    expect(listsAnyOpportunity({ ...LESSON, side: 'white' })).toBe(false);
  });

  it("leaves out a mistake only a learner's move off the book leads to", () => {
    // 1...c5 isn't the book's move, so the guide never plays into 2.Qh5 there.
    const offBook: Lesson = {
      ...LESSON,
      positions: {
        [at()]: { variation, moves: [move([], 'e4', 100)], games: [100] },
        [at('e4')]: {
          variation,
          moves: [move(['e4'], 'e5', 90, { book: true }), move(['e4'], 'c5', 10)],
          games: [100],
        },
        [at('e4', 'c5')]: {
          variation,
          moves: [move(['e4', 'c5'], 'Qh5', 10, mistake({ gain: [0.5], cost: 0.3 }))],
          games: [10],
        },
      },
    };
    expect(lessonOpportunities(offBook, 0)).toEqual([]);
    expect(listsAnyOpportunity(offBook)).toBe(false);
  });

  it("lists a mistake on the lesson's first move, at its start", () => {
    const first: Lesson = {
      ...LESSON,
      positions: {
        [at()]: {
          variation,
          moves: [move([], 'e4', 90), move([], 'f3', 10, mistake({ gain: [0.1], cost: 0.2 }))],
          games: [100],
        },
        [at('f3')]: { variation, moves: [move(['f3'], 'e5', 10, { book: true })], games: [10] },
      },
    };
    expect(listsAnyOpportunity(first)).toBe(true);
    expect(lessonOpportunities(first, 0).map(({ line }) => line)).toEqual([[uci('f3')]]);
  });

  it('shares the games equally among the moves where the band counts none', () => {
    // Nothing counted at the start: 1.e4, the guide's only move there, takes every game.
    const uncounted: Lesson = {
      ...LESSON,
      positions: { ...LESSON.positions, [at()]: { variation, moves: [{ uci: uci('e4') }] } },
    };
    const [qh5] = lessonOpportunities(uncounted, 0);
    expect(qh5).toMatchObject({ san: 'Qh5', reach: 1 });
  });

  it('ranks the Stafford lesson, its 6.Bg5 mating', () => {
    const stafford = lessonOpportunities(readShippedLesson('stafford'), 2);
    expect(stafford.length).toBeGreaterThan(0);
    expect(stafford.every(({ score }) => score !== undefined)).toBe(true);
    const bg5 = stafford.find(({ line }) =>
      line
        .join(' ')
        .endsWith(
          uciLine('e4', 'e5', 'Nf3', 'Nf6', 'Nxe5', 'Nc6', 'Nxc6', 'dxc6', 'd3', 'Bc5', 'Bg5').join(
            ' ',
          ),
        ),
    );
    expect(bg5?.mates).toBe(true);
  });
});

describe('opportunityMarks', () => {
  const marked = (passed: PositionKey[], seen: PositionKey[] = []): MarkedPositions => ({
    seen: seen.map(positionHash),
    passed: passed.map(positionHash),
  });
  const list = lessonOpportunities(LESSON, 0);

  it('marks a mistake seen once its cue was shown, passed once every line end below it is', () => {
    const marks = (progress: MarkedPositions) =>
      opportunityMarks(LESSON, progress, list).filter(Boolean);
    expect(marks(marked([]))).toEqual([]);
    expect(marks(marked([], [at('e4', 'e5', 'Qh5')]))).toEqual(['seen']);
    expect(marks(marked([at('e4', 'e5', 'Qh5', 'Nc6')]))).toEqual(['passed']);
  });
});
