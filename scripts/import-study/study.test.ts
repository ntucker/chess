import { describe, expect, it } from '@jest/globals';

import { positionKey } from '@/game/replay';
import { uciLine } from '@/lesson/lesson.fixture';

import { chapterMoves, isDubious, mainLine, parseStudy, withReplies } from './study';

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

  it('keeps a dubious move dubious in the moves it joins through', () => {
    const pgn = [
      chapter('London', '1. d4 d5 2. Bf4?! Nf6 *'),
      chapter('Main line', '3. e3 c5 *', AFTER_NF6),
    ].join('\n');
    const [, joined] = parseStudy(pgn, () => true);
    expect(isDubious([...mainLine(joined.moves[0])][2])).toBe(true);
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

describe('side-line introductions', () => {
  const commentOn = (pgn: string, sans: string[]) => {
    const chapter = parseStudy(pgn, () => true).at(-1)!;
    return [...chapterMoves(chapter)]
      .filter((move) => sans.includes(move.san))
      .map(({ san, comment }) => [san, comment]);
  };

  it("moves a side line's comment to the move it names where the line leaves earlier chapters", () => {
    const pgn = [
      chapter('Main line', '1. d4 d5 2. Bf4 e6 *'),
      chapter(
        'c5',
        '1. d4 Nf6 (1... d5 { Before Nf6 c5, its little brother. } 2. Bf4 c5 3. e3) 2. Bf4 *',
      ),
    ].join('\n');
    expect(commentOn(pgn, ['d5', 'c5'])).toEqual([
      ['d5', ''],
      ['c5', 'Before Nf6 c5, its little brother.'],
    ]);
  });

  it('reads a named move numbered up to two off, as studies often are, but not three', () => {
    const intro = (number: string) =>
      [
        chapter('Main line', '1. d4 d5 2. Bf4 e6 *'),
        chapter('c5', `1. d4 Nf6 (1... d5 { Then ${number}...c5 comes. } 2. Bf4 c5) 2. Bf4 *`),
      ].join('\n');
    // c5 is 2...c5: "4...c5" is two off, "5...c5" three.
    expect(commentOn(intro('4'), ['c5'])).toEqual([['c5', 'Then 4...c5 comes.']]);
    expect(commentOn(intro('5'), ['c5'])).toEqual([['c5', '']]);
  });

  it('leaves a comment that does not name that move, or opens no side line', () => {
    const pgn = [
      chapter('Main line', '1. d4 d5 2. Bf4 e6 *'),
      chapter('c5', '1. d4 Nf6 (1... d5 { A solid reply. } 2. Bf4 c5) 2. Bf4 *'),
      chapter('Again', '1. d4 d5 { Before Nf6 c5. } 2. Bf4 c5 *'),
    ].join('\n');
    const chapters = parseStudy(pgn, () => true);
    const comments = chapters
      .slice(1)
      .map((one) =>
        [...chapterMoves(one)]
          .filter((move) => move.comment)
          .map(({ san, comment }) => [san, comment]),
      );
    expect(comments).toEqual([[['d5', 'A solid reply.']], [['d5', 'Before Nf6 c5.']]]);
  });
});

describe('withReplies', () => {
  const pgn = chapter(
    'Main line',
    '1. d4 d5 2. Bf4 Nf6 3. Nf3 c5 4. dxc5 { You play e6. } (4. e3 Nc6) *',
  );

  it('adds a reply the study names in words after its line, as its own move', () => {
    const [main] = withReplies(
      parseStudy(pgn, () => true),
      { 'd4 d5 Bf4 Nf6 Nf3 c5 dxc5': 'e6' },
    );
    const dxc5 = [...chapterMoves(main)].find((move) => move.san === 'dxc5')!;
    const [e6] = dxc5.children;
    expect([e6.san, e6.uci, e6.ply, e6.comment]).toEqual(['e6', 'e7e6', 8, '']);
    expect(e6.parent).toBe(dxc5);
    expect(dxc5.comment).toBe('You play e6.');
  });

  it('refuses a line no chapter plays, or an illegal reply', () => {
    const chapters = parseStudy(pgn, () => true);
    expect(() => withReplies(chapters, { 'd4 d5 c4': 'e6' })).toThrow('No chapter plays d4 d5 c4');
    expect(() => withReplies(chapters, { 'd4 d5 Bf4 Nf6 Nf3 c5 dxc5': 'Qxc5' })).toThrow(
      'Qxc5 is not legal',
    );
  });
});
