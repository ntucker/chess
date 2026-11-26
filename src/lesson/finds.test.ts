import { describe, expect, it } from '@jest/globals';

import { cleanLineEnds } from './cleanRun';
import { writeFinds } from './finds';
import type { Lesson, PositionKey } from './lesson';
import { keyAfter, SAMPLE, uci, uciLine } from './lesson.fixture';

/** A Black lesson 1.e4 c6 2.d4, whose line ends there. */
function lesson(): Lesson {
  const variation = SAMPLE.positions[keyAfter()].variation;
  const positions: Record<PositionKey, Lesson['positions'][PositionKey]> = {
    [keyAfter()]: { variation, moves: [{ uci: uci('e4') }] },
    [keyAfter('e4')]: { variation, moves: [{ uci: uci('e4', 'c6'), book: true }] },
    [keyAfter('e4', 'c6')]: { variation, moves: [{ uci: uci('e4', 'c6', 'd4') }] },
  };
  return { ...SAMPLE, side: 'black', positions };
}

/** Past the guide's end: 2...d5 3.Bd3? dxe4. */
const PAST_END = {
  line: uciLine('e4', 'c6', 'd4', 'd5'),
  mistake: uci('e4', 'c6', 'd4', 'd5', 'Bd3'),
  replies: [uci('e4', 'c6', 'd4', 'd5', 'Bd3', 'dxe4')],
  payoff: [],
  cost: 0.3,
};

/** Another find past the guide's end, at the same position: 2...d6 3.Bd3? Nf6. */
const BESIDE = {
  ...PAST_END,
  line: uciLine('e4', 'c6', 'd4', 'd6'),
  mistake: uci('e4', 'c6', 'd4', 'd6', 'Bd3'),
  replies: [uci('e4', 'c6', 'd4', 'd6', 'Bd3', 'Nf6')],
};

describe('writeFinds', () => {
  it("books the learner's moves past the guide's end, so a clean run reaches the cue", () => {
    const written = writeFinds(lesson(), [PAST_END]);
    expect(written.positions[keyAfter('e4', 'c6', 'd4')].moves).toEqual([
      { uci: uci('e4', 'c6', 'd4', 'd5'), book: true },
    ]);
    // The clean run plays on past the old end and stops before the opponent's mistake, as at a trap.
    expect(cleanLineEnds(written, keyAfter('e4'))).toEqual([keyAfter('e4', 'c6', 'd4', 'd5')]);
  });

  it("leaves a later call's learner move unbooked where an earlier call's find booked another", () => {
    const guided = writeFinds(lesson(), [PAST_END]);
    expect(writeFinds(guided, [BESIDE]).positions[keyAfter('e4', 'c6', 'd4')].moves).toEqual([
      { uci: uci('e4', 'c6', 'd4', 'd5'), book: true },
      { uci: uci('e4', 'c6', 'd4', 'd6') },
    ]);
  });

  it("books each learner move past the guide's end when the finds are written together, in either order", () => {
    // So a clean run must pass each.
    for (const finds of [
      [PAST_END, BESIDE],
      [BESIDE, PAST_END],
    ]) {
      const moves = writeFinds(lesson(), finds).positions[keyAfter('e4', 'c6', 'd4')].moves;
      expect(moves.every(({ book }) => book)).toBe(true);
      expect(moves).toHaveLength(2);
    }
  });

  it("leaves the opponent's moves past the guide's end unbooked", () => {
    // 2...d5 3.e5 c5 4.Bb5+? Nc6: 3.e5 is White's, past the end.
    const find = {
      ...PAST_END,
      line: uciLine('e4', 'c6', 'd4', 'd5', 'e5', 'c5'),
      mistake: uci('e4', 'c6', 'd4', 'd5', 'e5', 'c5', 'Bb5+'),
      replies: [uci('e4', 'c6', 'd4', 'd5', 'e5', 'c5', 'Bb5+', 'Nc6')],
    };
    const written = writeFinds(lesson(), [find]);
    expect(written.positions[keyAfter('e4', 'c6', 'd4', 'd5')].moves).toEqual([
      { uci: uci('e4', 'c6', 'd4', 'd5', 'e5') },
    ]);
    expect(written.positions[keyAfter('e4', 'c6', 'd4', 'd5', 'e5')].moves).toEqual([
      { uci: uci('e4', 'c6', 'd4', 'd5', 'e5', 'c5'), book: true },
    ]);
  });
});
