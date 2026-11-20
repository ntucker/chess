import { describe, expect, it } from '@jest/globals';

import { positionKey } from '@/game/replay';
import { uciLine } from '@/lesson/lesson.fixture';

import { mainLine, parseStudy } from './study';

const AFTER_NF6 = 'rnbqkb1r/ppp1pppp/5n2/3p4/3P1B2/8/PPP1PPPP/RN1QKBNR w KQkq - 2 3';

const chapter = (title: string, moves: string, fen?: string) =>
  [
    `[Event "Study: ${title}"]`,
    `[ChapterName "${title}"]`,
    ...(fen ? ['[SetUp "1"]', `[FEN "${fen}"]`] : []),
    '',
    moves,
    '',
  ].join('\n');

describe('parseStudy', () => {
  it("joins a chapter set up where an earlier one's moves reach to those moves, without their comments", () => {
    const pgn = [
      chapter('London', '1. d4 d5 2. Bf4 { The London. } Nf6 *'),
      chapter('Main line', '3. e3 { Solid. } c5 *', AFTER_NF6),
    ].join('\n');
    const [first, joined] = parseStudy(pgn, () => true);
    expect(positionKey(joined.start)).toBe(positionKey(first.start));
    const line = [...mainLine(joined.moves[0])];
    expect(line.map(({ uci }) => uci)).toEqual(uciLine('d4', 'd5', 'Bf4', 'Nf6', 'e3', 'c5'));
    expect(line.map(({ comment }) => comment)).toEqual(['', '', '', '', 'Solid.', '']);
    expect(line.map(({ ply }) => ply)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(line[4].parent).toBe(line[3]);
    // The earlier chapter keeps its own moves and comments.
    expect([...mainLine(first.moves[0])][2].comment).toBe('The London.');
  });

  it('keeps a chapter set up where no earlier chapter goes', () => {
    const pgn = [
      chapter('London', '1. d4 d5 *'),
      chapter('Elsewhere', '3. e3 c5 *', AFTER_NF6),
    ].join('\n');
    const [, kept] = parseStudy(pgn, () => true);
    expect(kept.start.fullmoves).toBe(3);
    expect(kept.moves[0].uci).toBe('e2e3');
  });
});
