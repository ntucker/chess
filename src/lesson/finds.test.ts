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

describe('writeFinds', () => {
  it("books the learner's moves past the guide's end, so a clean run reaches the mistake", () => {
    const written = writeFinds(lesson(), [PAST_END]);
    expect(written.positions[keyAfter('e4', 'c6', 'd4')].moves).toEqual([
      { uci: uci('e4', 'c6', 'd4', 'd5'), book: true },
    ]);
    // The line now ends before the mistake, a trap a clean run skips, instead of nowhere.
    expect(cleanLineEnds(written, keyAfter('e4'))).toEqual([keyAfter('e4', 'c6', 'd4', 'd5')]);
  });

  it("leaves the learner's move unbooked where the guide books another", () => {
    const guided = writeFinds(lesson(), [PAST_END]);
    const other = {
      ...PAST_END,
      line: uciLine('e4', 'c6', 'd4', 'd6'),
      mistake: uci('e4', 'c6', 'd4', 'd6', 'Bd3'),
      replies: [uci('e4', 'c6', 'd4', 'd6', 'Bd3', 'Nf6')],
    };
    const written = writeFinds(guided, [other]);
    expect(written.positions[keyAfter('e4', 'c6', 'd4')].moves).toEqual([
      { uci: uci('e4', 'c6', 'd4', 'd5'), book: true },
      { uci: uci('e4', 'c6', 'd4', 'd6') },
    ]);
  });
});
