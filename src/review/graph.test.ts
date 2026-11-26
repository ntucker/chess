import { describe, expect, it } from '@jest/globals';

import {
  graphMarks,
  guideEnd,
  plyAt,
  plyX,
  SNAP_PX,
  topArea,
  topShares,
  unreadSpans,
} from './graph';
import { bookMove, judgedMove, listing, partial, waitingMove } from './review.fixture';

describe('topShares', () => {
  it("reads the top side's score from the best line of each analysis, sketch or final", () => {
    const analyses = [listing(['a', 0.5]), undefined, partial(12, ['a', 0.3])];
    expect(topShares(analyses, 'white')).toEqual([0.5, undefined, 0.3]);
    expect(topShares(analyses, 'black')).toEqual([0.5, undefined, 0.7]);
  });
});

describe('graphMarks', () => {
  // The learner plays White: a judged mistake at ply 2, and a move at ply 4
  // not judged yet that drops 0.2 in the sketch.
  const moves = [
    bookMove(0),
    bookMove(1),
    judgedMove(2, 'mistake', 0.5, 0.35),
    judgedMove(3),
    waitingMove(4),
    waitingMove(5),
  ];
  const analyses = [0.5, 0.5, 0.5, 0.35, 0.35, 0.15, 0.15].map((score) =>
    partial(12, ['a', score]),
  );

  it('marks the moments with their labels and the likely ones as rings, in game order', () => {
    expect(graphMarks(moves, analyses, 'white', [3])).toEqual([
      { ply: 3, quality: 'mistake' },
      { ply: 5, quality: undefined },
    ]);
  });

  it("marks a moment once, even when it's also a big drop", () => {
    expect(graphMarks(moves, analyses, 'white', [3, 5])).toEqual([
      { ply: 3, quality: 'mistake' },
      { ply: 5, quality: undefined },
    ]);
  });

  it("leaves out the opponent's drops", () => {
    expect(graphMarks(moves, analyses, 'black', [])).toEqual([]);
  });
});

describe('guideEnd', () => {
  it("ends after the guide's last move before the learner leaves it", () => {
    expect(guideEnd(['book', 'book', undefined, 'book'], 'white')).toBe(2);
    expect(guideEnd(['book', 'book', 'book', undefined, 'book'], 'black')).toBe(3);
    expect(guideEnd([undefined, 'book'], 'white')).toBe(0);
    expect(guideEnd(['book', 'book'], 'white')).toBe(2);
    expect(guideEnd([], 'white')).toBe(0);
  });

  it("isn't ended by an opponent's move the guide doesn't recommend", () => {
    // A lesson for Black: White's moves aren't the guide's.
    expect(guideEnd([undefined, 'book', undefined, 'book', undefined, undefined], 'black')).toBe(4);
    expect(guideEnd([undefined, 'book', undefined, 'book'], 'black')).toBe(4);
  });
});

describe('topArea', () => {
  it("outlines the top side's share at each position", () => {
    expect(topArea([0.5, 0.75, 0.5])).toBe('M0 0 L0 0.5 L1 0.75 L2 0.5 L2 0 Z');
  });
});

describe('unreadSpans', () => {
  it('covers each unread stretch from the position read before it to the one after', () => {
    expect(unreadSpans([0.5, undefined, undefined, 0.4, 0.4])).toEqual([[0, 3]]);
    expect(unreadSpans([undefined, 0.5, undefined])).toEqual([
      [0, 1],
      [1, 2],
    ]);
    expect(unreadSpans([0.5, 0.5])).toEqual([]);
  });
});

describe('plyAt', () => {
  // Ten moves over 200 px: 20 px a move.
  it('names the nearest position, within the game', () => {
    expect(plyAt(0, 200, 10, [])).toBe(0);
    expect(plyAt(29, 200, 10, [])).toBe(1);
    expect(plyAt(31, 200, 10, [])).toBe(2);
    expect(plyAt(-50, 200, 10, [])).toBe(0);
    expect(plyAt(500, 200, 10, [])).toBe(10);
  });

  it("lands on a moment's dot within SNAP_PX", () => {
    // Ten moves over 40 px: 4 px a move, so ply 3's dot sits at 12 px.
    expect(plyAt(12 + SNAP_PX - 1, 40, 10, [3])).toBe(3);
    expect(plyAt(12 + SNAP_PX + 1, 40, 10, [3])).toBe(5);
    // The nearer of two dots wins: 17 px is 5 from ply 3's and 3 from ply 5's.
    expect(plyAt(17, 40, 10, [3, 5])).toBe(5);
  });

  it('names the start in an empty game', () => {
    expect(plyAt(10, 200, 0, [])).toBe(0);
  });
});

describe('plyX', () => {
  it('stands each position where plyAt reads it', () => {
    expect(plyX(0, 200, 10)).toBe(0);
    expect(plyX(3, 200, 10)).toBe(60);
    expect(plyX(10, 200, 10)).toBe(200);
    expect(plyAt(plyX(7, 200, 10), 200, 10, [])).toBe(7);
  });

  it('stands an empty game at the start', () => {
    expect(plyX(0, 200, 0)).toBe(0);
  });
});
