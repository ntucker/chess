import { describe, expect, it } from '@jest/globals';

import type { Analysis } from '@/evaluation/evaluation';

import { nextSearch, type OrderInput, SKETCH_DEPTH } from './order';
import { bookMove, listing, partial, waitingMove } from './review.fixture';

/** Six moves, the first two from the guide, the rest not judged yet; the learner plays White. */
const book = [true, true];
const moves = [bookMove(0), bookMove(1), ...[2, 3, 4, 5].map((ply) => waitingMove(ply))];

/** A sketch where White's expected score is `score`. */
const sketch = (score: number) => partial(SKETCH_DEPTH, ['a', score]);
const final = (score: number) => listing(['a', score]);

const order = (analyses: (Analysis | undefined)[], input: Partial<OrderInput> = {}) =>
  nextSearch({ moves, book, analyses, learner: 'white', ...input });

describe('nextSearch', () => {
  it('sketches every position first, in game order', () => {
    expect(order([])).toBe(0);
    expect(order([sketch(0.5), partial(SKETCH_DEPTH - 1, ['a', 0.5])])).toBe(1);
    expect(order([final(0.5), sketch(0.5), sketch(0.5)])).toBe(3);
  });

  it("puts first the move the board rests on, unless it's from the guide", () => {
    expect(order([], { dwelt: 4 })).toBe(3);
    expect(order([undefined, undefined, undefined, final(0.5)], { dwelt: 4 })).toBe(4);
    // Then the position before the opponent's previous move, which Miss reads.
    expect(order([undefined, undefined, undefined, final(0.5), final(0.5)], { dwelt: 4 })).toBe(2);
    expect(order([], { dwelt: 2 })).toBe(0);
  });

  // White's moves at ply 2 and 4 drop 0.1 and 0.3; Black's at ply 3 and 5 nothing.
  const sketched = [0.5, 0.5, 0.5, 0.4, 0.4, 0.1, 0.1].map(sketch);

  it("then searches in full around the learner's biggest drops, largest first", () => {
    expect(order(sketched)).toBe(4);
    // Before and after White's worst move, then before Black's move just before it (Miss).
    const worstDone = [...sketched.slice(0, 4), final(0.4), final(0.1), sketched[6]];
    expect(order(worstDone)).toBe(3);
    expect(order([...worstDone.slice(0, 3), final(0.4), ...worstDone.slice(4)])).toBe(2);
  });

  it('then the rest in game order, skipping positions only guide moves touch', () => {
    // Without drops, the positions in game order; 0 and 1 are only touched by book moves.
    const even = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5].map(sketch);
    expect(order(even)).toBe(2);
    const done = [...even.slice(0, 2), ...[0.5, 0.5, 0.5, 0.5, 0.5].map(final)];
    expect(order(done)).toBeUndefined();
  });

  it('skips positions whose search failed, so the rest go on', () => {
    expect(order([], { failed: new Set([0]) })).toBe(1);
    const even = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5].map(sketch);
    expect(order(even, { failed: new Set([2, 3]) })).toBe(4);
  });

  it('keeps a search running in full until it is final', () => {
    const running = [...sketched.slice(0, 6), partial(SKETCH_DEPTH + 3, ['a', 0.1])];
    expect(order(running)).toBe(6);
  });
});
