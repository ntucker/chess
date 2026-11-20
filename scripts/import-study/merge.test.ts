import { describe, expect, it } from '@jest/globals';
import { settledAnalysis } from '@/evaluation/evaluation';
import { checkLesson } from '@/lesson/check';
import { keyAfter, SAMPLE } from '@/lesson/lesson.fixture';

import { fillBook } from './engineCheck';
import { extractChapter } from './extract';
import { STUDY_PGN } from './fixture';
import { mergeChapters, type SourceTally } from './merge';
import { parseStudy } from './study';

const chapters = parseStudy(STUDY_PGN, () => true);
const lesson = mergeChapters(
  {
    id: 'test',
    title: 'Caro-Kann',
    side: 'black',
    sources: SAMPLE.sources,
  },
  chapters,
  chapters.map((chapter) => extractChapter(chapter, 'black')),
);

const at = (...sans: string[]) => lesson.positions[keyAfter(...sans)];
const moves = (...sans: string[]) =>
  at(...sans).moves.map(({ uci, book, risk }) => [uci, book ?? false, risk]);

describe('mergeChapters', () => {
  it('refuses a lesson without chapters', () => {
    expect(() => mergeChapters(lesson, [], [])).toThrow('No chapters to merge for lesson test');
  });

  it('writes a lesson the checker accepts, once fillBook has picked the book moves it leaves open', async () => {
    const even = async () => settledAnalysis({ score: 0.5, pawns: 0 });
    expect(checkLesson((await fillBook(lesson, even)).lesson)).toEqual([]);
  });

  it("books none of the learner's moves from a chapter written for the other side", () => {
    const theirs = chapters.map((chapter) => ({ ...chapter, writtenFor: 'white' as const }));
    const merged = mergeChapters(
      lesson,
      theirs,
      theirs.map((chapter) => extractChapter(chapter, 'black')),
    );
    const book = Object.values(merged.positions).flatMap((pos) => pos.moves.filter((m) => m.book));
    expect(book).toEqual([]);
    // Its moves stay in the guide, for fillBook to choose among.
    expect(merged.positions[keyAfter('e4', 'c6', 'd4', 'd5', 'e5')].moves.length).toBe(2);
  });

  it("books the learner's moves from a chapter written for the other side that recommends them", () => {
    const theirs = chapters.map((chapter) => ({
      ...chapter,
      writtenFor: 'white' as const,
      recommends: true as const,
    }));
    const own = mergeChapters(
      lesson,
      chapters,
      chapters.map((chapter) => extractChapter(chapter, 'black')),
    );
    const merged = mergeChapters(
      lesson,
      theirs,
      theirs.map((chapter) => extractChapter(chapter, 'black')),
    );
    const book = (of: typeof merged) =>
      Object.values(of.positions).flatMap((pos) =>
        pos.moves.filter((m) => m.book).map((m) => m.uci),
      );
    expect(book(merged).length).toBeGreaterThan(0);
    expect(book(merged)).toEqual(book(own));
  });

  it('groups chapter variations by the title before the colon, joining (I) and (II)', () => {
    expect(lesson.variations).toEqual({
      test: { name: 'Caro-Kann' },
      'advance-variation': { name: 'Advance Variation', parent: 'test' },
      'advance-variation-short-variation': {
        name: 'Advance Variation: Short Variation',
        parent: 'advance-variation',
      },
      'classical-variation': { name: 'Classical Variation', parent: 'test' },
      'classical-variation-capablanca': {
        name: 'Classical Variation: Capablanca',
        parent: 'classical-variation',
      },
    });
  });

  it("names variations by the study's own chapter names, a chapter with none being the opening's", () => {
    const named = mergeChapters(
      lesson,
      chapters,
      chapters.map((chapter) => extractChapter(chapter, 'black')),
      (title) => (title.includes('Advance') ? 'Advance: Short' : undefined),
    );
    expect(named.variations).toEqual({
      test: { name: 'Caro-Kann' },
      advance: { name: 'Advance', parent: 'test' },
      'advance-short': { name: 'Advance: Short', parent: 'advance' },
    });
    expect(named.positions[keyAfter('e4', 'c6', 'Nc3', 'd5', 'd4')].variation).toBe('test');
  });

  it('nests a chapter name with more colons inside each group before it', () => {
    const named = mergeChapters(
      lesson,
      chapters,
      chapters.map((chapter) => extractChapter(chapter, 'black')),
      (title) => (title.includes('Advance') ? 'Advance: Short: Main Line' : 'Advance: Short'),
    );
    expect(named.variations).toEqual({
      test: { name: 'Caro-Kann' },
      advance: { name: 'Advance', parent: 'test' },
      'advance-short': { name: 'Advance: Short', parent: 'advance' },
      'advance-short-main-line': { name: 'Advance: Main Line', parent: 'advance-short' },
    });
  });

  it("names a nested chapter's side line from the opening's position after its top group", () => {
    const named = mergeChapters(
      lesson,
      chapters,
      chapters.map((chapter) => extractChapter(chapter, 'black')),
      (title) =>
        title.includes('Advance') ? 'Advance: Short: Main Line' : 'Classical: Capablanca',
    );
    expect(named.positions[keyAfter('e4', 'c6', 'Nc3')].variation).toBe('advance');
  });

  it("names a shared position after the opening, and one chapter's after that chapter", () => {
    expect(at('e4', 'c6', 'd4', 'd5').variation).toBe('test');
    expect(at('e4', 'c6', 'd4', 'd5', 'e5').variation).toBe('advance-variation-short-variation');
  });

  it("names a side line after where it leaves the main line, but no wider than its chapter's group", () => {
    expect(at('e4', 'c6', 'Nc3').variation).toBe('advance-variation');
    expect(at('e4', 'c6', 'd4', 'd5', 'e5', 'Bf5', 'g4').variation).toBe(
      'advance-variation-short-variation',
    );
  });

  it('names a transposition after the chapter whose main line reaches it', () => {
    expect(at('e4', 'c6', 'Nc3', 'd5', 'd4').variation).toBe('classical-variation-capablanca');
    expect(at('e4', 'c6', 'd4', 'd5', 'Nc3').moves).toEqual([{ uci: 'd5e4', book: true }]);
  });

  it("marks the study's first learner move as book, and choice guide options with their risk", () => {
    expect(moves('e4', 'c6', 'd4', 'd5', 'e5')).toEqual([
      ['c8f5', true, 'safe'],
      ['c6c5', false, undefined],
    ]);
  });

  it("keeps book replies to the opponent's side lines, but none after a dubious learner move", () => {
    expect(moves('e4', 'c6', 'd4', 'd5', 'e5', 'Bf5', 'g4')).toEqual([['f5d7', true, undefined]]);
    expect(moves('e4', 'c6', 'd4', 'd5', 'e5', 'Bf5', 'Nf3', 'Qb6', 'Nc3')).toEqual([
      ['e7e6', false, undefined],
    ]);
  });

  it('adds sequences from comment text in the variation they leave from', () => {
    expect(at('e4', 'c6', 'd4', 'd5', 'e5', 'Bf5', 'Nf3', 'e6', 'Be2', 'Nd7')).toEqual({
      variation: 'advance-variation-short-variation',
      moves: [{ uci: 'e1g1' }],
    });
  });

  it('puts an idea about the position before a move on that position', () => {
    expect(at('e4', 'c6', 'd4', 'd5', 'e5').notes).toEqual([
      expect.objectContaining({
        original: '...Bf5, ...e6 and ...c5',
        ideas: [expect.objectContaining({ type: 'plan' })],
      }),
    ]);
  });

  it('leaves out positions where the guide stops', () => {
    expect(at('e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4', 'Bf5')).toBeUndefined();
  });
});

describe('mergeChapters with several sources', () => {
  // The main guide answers 1.d4 with 1...d5 and stops after 2.c4; the second
  // agrees on 1...d5, goes on to 2...c6, and prefers 1...Nf6 against 1.c4.
  const main = parseStudy(
    '[ChapterName "Main"]\n\n1. d4 { Claims the centre at once. } d5 { Holds the centre with a pawn. } 2. c4 *\n\n' +
      '[ChapterName "English"]\n\n1. c4 e5 *\n',
    () => true,
  ).map((chapter) => ({ ...chapter, source: 0 }));
  const second = parseStudy(
    '[ChapterName "Second"]\n\n1. d4 d5 { Black takes the centre and keeps it for good. } 2. c4 c6 *\n\n' +
      '[ChapterName "Second English"]\n\n1. c4 Nf6 *\n',
    () => true,
  ).map((chapter) => ({ ...chapter, source: 1 }));
  const both = [...main, ...second];
  const tally: SourceTally[] = [];
  const merged = mergeChapters(
    { id: 'test', title: 'Test', side: 'black', sources: SAMPLE.sources },
    both,
    both.map((chapter) => extractChapter(chapter, 'black')),
    () => undefined,
    tally,
  );
  const book = (...sans: string[]) =>
    merged.positions[keyAfter(...sans)].moves.filter((move) => move.book).map(({ uci }) => uci);

  it("keeps the main guide's moves, and takes a later one's where the main stops", () => {
    expect(book('d4')).toEqual(['d7d5']);
    expect(book('d4', 'd5', 'c4')).toEqual(['c7c6']);
    expect(book('c4')).toEqual(['e7e5']);
  });

  it("follows a later guide's side line under a move the main guide recommends", () => {
    // The later guide prefers 1...Nf6 but also covers 1...d5, which the main guide recommends.
    const later = parseStudy(
      '[ChapterName "Later"]\n\n1. d4 Nf6 (1... d5 2. c4 c6) *\n',
      () => true,
    ).map((chapter) => ({ ...chapter, source: 1 }));
    const chapters = [main[0], ...later];
    const lesson = mergeChapters(
      { id: 'test', title: 'Test', side: 'black', sources: SAMPLE.sources },
      chapters,
      chapters.map((chapter) => extractChapter(chapter, 'black')),
      () => undefined,
    );
    const booked = (...sans: string[]) =>
      lesson.positions[keyAfter(...sans)].moves.filter((move) => move.book).map(({ uci }) => uci);
    expect(booked('d4')).toEqual(['d7d5']);
    expect(booked('d4', 'd5', 'c4')).toEqual(['c7c6']);
  });

  it("keeps the main guide's names where a later guide's broader chapter passes", () => {
    // The main guide names its line "Queen's Gambit: Slav"; the later one's chapter is only "Queen's Gambit".
    const named = (title: string, source: number) => (chapter: { source?: number }) =>
      chapter.source === source ? title : undefined;
    const chapters = [main[0], second[0]];
    const lesson = mergeChapters(
      { id: 'test', title: 'Test', side: 'black', sources: SAMPLE.sources },
      chapters,
      chapters.map((chapter) => extractChapter(chapter, 'black')),
      (_, chapter) =>
        named("Queen's Gambit: Slav", 0)(chapter) ?? named("Queen's Gambit", 1)(chapter),
    );
    expect(lesson.positions[keyAfter('d4', 'd5')].variation).toBe('queen-s-gambit-slav');
    // Past the main guide's end, the later guide names its own positions.
    expect(lesson.positions[keyAfter('d4', 'd5', 'c4')].variation).toBe('queen-s-gambit');
  });

  it("lets a later guide narrow the name of the main guide's side line", () => {
    // The main guide's chapter is about the opening and shows 1...Nf6 only as a side line.
    const opening = parseStudy(
      '[ChapterName "Main"]\n\n1. d4 d5 (1... Nf6 2. c4 e6) *\n',
      () => true,
    );
    const later = parseStudy('[ChapterName "Later"]\n\n1. d4 Nf6 2. c4 e6 *\n', () => true);
    const chapters = [...opening, ...later.map((chapter) => ({ ...chapter, source: 1 }))];
    const lesson = mergeChapters(
      { id: 'test', title: 'Test', side: 'black', sources: SAMPLE.sources },
      chapters,
      chapters.map((chapter) => extractChapter(chapter, 'black')),
      (_, chapter) => (chapter.source === 1 ? 'Indian Defence: Test' : undefined),
    );
    expect(lesson.positions[keyAfter('d4', 'Nf6')].variation).toBe('indian-defence-test');
  });

  it("names a later guide's side line after the main guide's line it leaves", () => {
    // Past the main guide's 2.c4, only the later guide's side line goes on; its chapter is a sibling.
    const opening = parseStudy('[ChapterName "Main"]\n\n1. d4 d5 2. c4 *\n', () => true);
    const later = parseStudy(
      '[ChapterName "Later"]\n\n1. d4 Nf6 (1... d5 2. c4 c6 3. Nc3) *\n',
      () => true,
    );
    const chapters = [...opening, ...later.map((chapter) => ({ ...chapter, source: 1 }))];
    const lesson = mergeChapters(
      { id: 'test', title: 'Test', side: 'black', sources: SAMPLE.sources },
      chapters,
      chapters.map((chapter) => extractChapter(chapter, 'black')),
      (_, chapter) => (chapter.source === 1 ? 'Gambit: Classical' : 'Gambit: Sidelines'),
    );
    expect(lesson.positions[keyAfter('d4', 'd5', 'c4')].variation).toBe('gambit-sidelines');
  });

  it('names moves by a chapter cut out at a named position, and keeps the name past its end', () => {
    // The Alapin chapter plays on to 4.Nc3; the Dutch one is cut out at 2...c6 and stops at 3...Nf6.
    const alapin = parseStudy(
      '[ChapterName "Alapin"]\n\n1. d4 d5 2. c4 c6 3. Nf3 Nf6 4. Nc3 dxc4 *\n',
      () => true,
    );
    const dutch = parseStudy(
      '[ChapterName "Dutch"]\n[NamedFrom "4"]\n\n1. d4 d5 2. c4 c6 3. Nf3 Nf6 *\n',
      () => true,
    );
    const chapters = [...alapin, ...dutch.map((chapter) => ({ ...chapter, source: 1 }))];
    const lesson = mergeChapters(
      { id: 'test', title: 'Test', side: 'black', sources: SAMPLE.sources },
      chapters,
      chapters.map((chapter) => extractChapter(chapter, 'black')),
      (title) => (title === 'Dutch' ? 'Pure: Alapin: Dutch' : 'Pure: Alapin'),
    );
    const variation = (...sans: string[]) => lesson.positions[keyAfter(...sans)].variation;
    expect(variation('d4', 'd5', 'c4')).toBe('pure-alapin');
    expect(variation('d4', 'd5', 'c4', 'c6')).toBe('pure-alapin-dutch');
    expect(variation('d4', 'd5', 'c4', 'c6', 'Nf3', 'Nf6')).toBe('pure-alapin-dutch');
    expect(variation('d4', 'd5', 'c4', 'c6', 'Nf3', 'Nf6', 'Nc3')).toBe('pure-alapin-dutch');
  });

  /** A lesson merged from `pgns`, the second and later from later guides, each chapter named by `names`. */
  const mergeSources = (pgns: readonly string[], names: Record<string, string> = {}) => {
    const chapters = pgns.flatMap((pgn, source) =>
      parseStudy(pgn, () => true).map((chapter) => ({ ...chapter, source })),
    );
    const lesson = mergeChapters(
      { id: 'test', title: 'Test', side: 'white', sources: SAMPLE.sources },
      chapters,
      chapters.map((chapter) => extractChapter(chapter, 'white')),
      (title) => names[title],
    );
    return (...sans: string[]) => lesson.positions[keyAfter(...sans)].variation;
  };

  it("never lets a later guide's main line rename the main guide's side line", () => {
    // The main guide's Early chapter shows 3...c5 4.c3 Qb6 only as a side line; a later guide's Anti chapter plays it.
    const variation = mergeSources(
      [
        '[ChapterName "Early"]\n\n1. d4 d5 2. Bf4 Nf6 3. e3 Bf5 (3... c5 4. c3 Qb6 5. Qb3) 4. Nf3 *\n',
        '[ChapterName "Anti"]\n\n1. d4 d5 2. Bf4 Nf6 3. e3 c5 4. c3 Qb6 5. Qb3 Nc6 *\n',
      ],
      { Early: 'Early', Anti: 'Anti' },
    );
    expect(variation('d4', 'd5', 'Bf4', 'Nf6', 'e3', 'c5')).toBe('early');
    expect(variation('d4', 'd5', 'Bf4', 'Nf6', 'e3', 'c5', 'c3', 'Qb6')).toBe('early');
  });

  it("names the main guide's side line after the line it came through, once a later guide names that", () => {
    // 3...c5 is a side line of two main-guide chapters, so it is the first one's group; the later guide narrows it.
    const variation = mergeSources(
      [
        [
          '[ChapterName "Systems"]\n\n1. d4 d5 2. Bf4 Nf6 3. e3 e6 (3... c5 4. Nf3) 4. Nf3 *\n',
          '[ChapterName "Early"]\n\n1. d4 d5 2. Bf4 Nf6 3. e3 Bf5 (3... c5 4. c3 Qb6 5. Qb3) 4. Nf3 *\n',
        ].join('\n'),
        '[ChapterName "Anti"]\n\n1. d4 d5 2. Bf4 Nf6 3. e3 c5 4. Nf3 Nc6 *\n',
      ],
      { Systems: 'Systems', Early: 'Early', Anti: 'Systems: Anti' },
    );
    expect(variation('d4', 'd5', 'Bf4', 'Nf6', 'e3', 'c5')).toBe('systems-anti');
    expect(variation('d4', 'd5', 'Bf4', 'Nf6', 'e3', 'c5', 'c3')).toBe('systems-anti');
    expect(variation('d4', 'd5', 'Bf4', 'Nf6', 'e3', 'c5', 'c3', 'Qb6')).toBe('systems-anti');
  });

  it("names positions before a chapter's named move after its parent, and lines its name claims after it", () => {
    const variation = mergeSources(
      [
        [
          '[ChapterName "Early"]\n\n1. d4 d5 2. Bf4 Nf6 3. e3 Bf5 (3... c6 4. Nf3 Bf5 5. c4) 4. Nf3 e6 *\n',
          '[ChapterName "Tal"]\n\n1. d4 d5 2. Bf4 Nf6 3. h4 (3. g4 Bxg4 4. f3) 3... c5 4. c3 *\n',
        ].join('\n'),
      ],
      { Early: 'London: Early ...Bf5', Tal: 'London: Tal (3.h4) & Bayonet (3.g4)' },
    );
    // Before ...Bf5, the Early chapter's moves are the London's.
    expect(variation('d4', 'd5', 'Bf4', 'Nf6', 'e3')).toBe('london');
    expect(variation('d4', 'd5', 'Bf4', 'Nf6', 'e3', 'Bf5')).toBe('london-early-bf5');
    // ...Bf5 on a side line leaving before it starts a line the chapter claims; the moves before it don't.
    expect(variation('d4', 'd5', 'Bf4', 'Nf6', 'e3', 'c6', 'Nf3')).toBe('london');
    expect(variation('d4', 'd5', 'Bf4', 'Nf6', 'e3', 'c6', 'Nf3', 'Bf5')).toBe('london-early-bf5');
    // The Tal chapter claims 3.g4, which it plays only as a side line.
    expect(variation('d4', 'd5', 'Bf4', 'Nf6', 'g4', 'Bxg4')).toBe('london-tal-3-h4-bayonet-3-g4');
  });

  it("lets a later guide's main line through a line the main guide's name claims", () => {
    const variation = mergeSources(
      [
        '[ChapterName "Early"]\n\n1. d4 d5 2. Bf4 Nf6 3. e3 Bf5 (3... c6 4. Nf3 Bf5 5. c4 e6) 4. Nf3 e6 *\n',
        '[ChapterName "Slow"]\n\n1. d4 d5 2. Bf4 Nf6 3. e3 c6 4. Nf3 Bf5 5. c4 e6 6. Nc3 *\n',
      ],
      { Early: 'London: Early ...Bf5', Slow: 'London: Slow Slav' },
    );
    expect(variation('d4', 'd5', 'Bf4', 'Nf6', 'e3', 'c6', 'Nf3', 'Bf5')).toBe('london-slow-slav');
  });

  it("names a side line two chapters' groups share after the first chapter", () => {
    const variation = mergeSources(
      [
        [
          '[ChapterName "Early"]\n\n1. d4 d5 2. Bf4 Bf5 (2... c5 3. e3 Nc6 4. c3) 3. e3 *\n',
          '[ChapterName "Anti"]\n\n1. d4 d5 2. Bf4 c6 (2... c5 3. e3 Nc6 4. Nf3) 3. e3 *\n',
        ].join('\n'),
      ],
      { Early: 'Early', Anti: 'Anti' },
    );
    expect(variation('d4', 'd5', 'Bf4', 'c5', 'e3', 'Nc6')).toBe('early');
  });

  it("takes a later guide's notes only where the main guide says nothing", () => {
    const d5 = merged.positions[keyAfter('d4')].moves.find(({ uci }) => uci === 'd7d5')!;
    expect(d5.notes?.map(({ text }) => text)).toEqual(['Holds the centre with a pawn.']);
  });

  it("keeps a later guide's note beside a line introduction moved onto the move", () => {
    // The side line's intro on 1.d4 names 2.Bf4, where the line first goes somewhere new.
    const intro = parseStudy(
      '[ChapterName "Main"]\n\n1. d4 d5 2. c4 *\n\n' +
        '[ChapterName "Side"]\n\n1. e4 (1. d4 { Its quieter brother is the 2.Bf4 line. } d5 2. Bf4) e5 *\n',
      () => true,
    ).map((chapter) => ({ ...chapter, source: 0 }));
    const london = parseStudy(
      '[ChapterName "London"]\n\n1. d4 d5 2. Bf4 { The bishop comes out before e3. } *\n',
      () => true,
    ).map((chapter) => ({ ...chapter, source: 1 }));
    const chapters = [...intro, ...london];
    const lesson = mergeChapters(
      { id: 'test', title: 'Test', side: 'black', sources: SAMPLE.sources },
      chapters,
      chapters.map((chapter) => extractChapter(chapter, 'black')),
      () => undefined,
    );
    const bf4 = lesson.positions[keyAfter('d4', 'd5')].moves.find(({ uci }) => uci === 'c1f4')!;
    expect(bf4.notes?.map(({ text }) => text)).toEqual([
      'Its quieter brother is the 2.Bf4 line.',
      'The bishop comes out before e3.',
    ]);
  });

  it('counts what each guide gave, and what the main guide kept out', () => {
    expect(tally).toEqual([
      { booked: 2, blocked: new Set(), notes: 2, notesSkipped: 0 },
      { booked: 1, blocked: new Set([`${keyAfter('c4')} g8f6`]), notes: 0, notesSkipped: 1 },
    ]);
  });
});
