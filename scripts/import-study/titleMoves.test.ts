import { describe, expect, it } from '@jest/globals';

import { parseStudy, type StudyMove } from './study';
import { withTitleMoves } from './titleMoves';

const titled = (name: string, moves: string, headers = '') => {
  const [chapter] = parseStudy(`[ChapterName "${name}"]\n${headers}\n${moves}\n`, () => true);
  return withTitleMoves(chapter, name);
};

/** A claimed move as its line from the start, in SAN. */
const line = (move: StudyMove) => {
  const sans: string[] = [];
  for (let at: StudyMove | undefined = move; at; at = at.parent) sans.unshift(at.san);
  return sans.join(' ');
};

describe('withTitleMoves', () => {
  it('names a chapter from the move its name gives on the main line', () => {
    const chapter = titled('London: Early ...Bf5', '1. d4 d5 2. Bf4 Nf6 3. e3 Bf5 4. Nf3 *');
    expect(chapter.namedFrom).toBe(6);
    expect(chapter.claims).toBeUndefined();
  });

  it('claims a numbered move the chapter plays only on a side line leaving before its named move', () => {
    const chapter = titled(
      'Advance: Tal (4.h4) & Bayonet (4.g4)',
      '1. e4 c6 2. d4 d5 3. e5 Bf5 4. h4 (4. g4 Bd7) 4... h5 (4... h6 5. g4) 5. Bd3 *',
    );
    expect(chapter.namedFrom).toBe(7);
    // 5.g4 leaves after 4.h4, so that line is the chapter's already.
    expect(chapter.claims?.map(line)).toEqual(['e4 c6 d4 d5 e5 Bf5 g4']);
  });

  it('reads a bare move after a numbered one as its reply', () => {
    const chapter = titled(
      'Accelerated Panov: 3.Nc3 d4',
      '1. e4 c6 2. c4 d5 3. Nc3 (3. e5 d4 4. Nf3) 3... d4 4. Nce2 *',
    );
    expect(chapter.namedFrom).toBe(5);
    expect(chapter.claims).toBeUndefined();
  });

  it("finds a named move at another number when the study's numbers are off", () => {
    expect(titled('Fantasy: 4...Qb6', '1. e4 c6 2. d4 d5 3. f3 Qb6 4. Nc3 *').namedFrom).toBe(6);
  });

  it('keeps the start of a chapter cut out at a named position', () => {
    const chapter = titled(
      'Pure: Dutch (6.e3)',
      '1. d4 d5 2. c4 c6 3. Nf3 Nf6 *',
      '[NamedFrom "4"]',
    );
    expect(chapter.namedFrom).toBe(4);
  });
});
