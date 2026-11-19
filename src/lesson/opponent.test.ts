import { describe, expect, it, jest } from '@jest/globals';

import type { GameOpponent } from '@/game/game';

import { MAIN, SAMPLE, uciLine } from './lesson.fixture';
import { lessonOpponent } from './opponent';

/** An engine that always answers `uci`, recording what it was asked. */
function engine(uci: string) {
  const reply = jest.fn(async (_line: readonly string[]) => uci);
  return { id: 'engine', reply } satisfies GameOpponent;
}

describe('lessonOpponent', () => {
  it("plays the guide's most common move for the opponent's rating band", async () => {
    const beyond = engine('h2h3');
    expect(await lessonOpponent(SAMPLE, 1100, beyond).reply(uciLine(...MAIN))).toBe('e4d5');
    expect(await lessonOpponent(SAMPLE, 1500, beyond).reply(uciLine(...MAIN))).toBe('e4e5');
    expect(beyond.reply).not.toHaveBeenCalled();
  });

  it('reads the top band at the Stockfish step, and the main line on a tie', async () => {
    // Bb5 against c3: 26 to 26 games in the 1600 band, 26 to 28 in the 1800 band.
    const line = uciLine(...MAIN, 'e5', 'c5', 'dxc5', 'Nc6', 'Nf3', 'Bg4');
    const reply = (opponent: 1700 | 1900 | 'stockfish') =>
      lessonOpponent(SAMPLE, opponent, engine('h2h3')).reply(line);
    expect(await reply(1700)).toBe('f1b5');
    expect(await reply(1900)).toBe('c2c3');
    expect(await reply('stockfish')).toBe('c2c3');
  });

  it('hands over to the engine beyond the guide and at a guide end', async () => {
    const beyond = engine('g1f3');
    const opponent = lessonOpponent(SAMPLE, 1500, beyond);
    expect(await opponent.reply(uciLine('e4', 'e5'))).toBe('g1f3');
    const end = uciLine(...MAIN, 'e5', 'Bf5', 'Nf3', 'e6', 'Be2', 'c5', 'O-O', 'Nc6');
    expect(await opponent.reply(end)).toBe('g1f3');
    expect(beyond.reply.mock.calls).toEqual([[uciLine('e4', 'e5')], [end]]);
  });

  it("plays the reply a choice picks among the guide's moves, most played first", async () => {
    const offered: string[] = [];
    const last = lessonOpponent(SAMPLE, 1500, engine('h2h3'), (replies) => {
      offered.push(...replies.map(({ move }) => move.uci));
      return replies.at(-1);
    });
    const reply = await last.reply(uciLine(...MAIN));
    expect(offered[0]).toBe('e4e5');
    expect(offered.length).toBeGreaterThan(1);
    expect(reply).toBe(offered.at(-1));
    // A choice is another opponent: an answer chosen without it no longer fits.
    expect(last.id).not.toBe(lessonOpponent(SAMPLE, 1500, engine('h2h3')).id);
  });

  it('is a different opponent for another lesson or engine', () => {
    const one = lessonOpponent(SAMPLE, 1500, engine('a2a3'));
    expect(one.id).toBe('caro-kann-sample:engine');
    expect(lessonOpponent(SAMPLE, 1500, { ...engine('a2a3'), id: '1900' }).id).not.toBe(one.id);
  });
});
