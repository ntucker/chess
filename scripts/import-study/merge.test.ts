import { describe, expect, it } from '@jest/globals';
import { checkLesson } from '@/lesson/check';
import { keyAfter } from '@/lesson/lesson.fixture';

import { extractChapter } from './extract';
import { STUDY_PGN } from './fixture';
import { mergeChapters } from './merge';
import { parseStudy } from './study';

const chapters = parseStudy(STUDY_PGN, () => true);
const lesson = mergeChapters(
  { id: 'test', title: 'Caro-Kann', side: 'black', source: { title: 'Test', author: 'Test', url: '' } },
  chapters,
  chapters.map((chapter) => extractChapter(chapter, 'black')),
);

const at = (...sans: string[]) => lesson.positions[keyAfter(...sans)];
const moves = (...sans: string[]) => at(...sans).moves.map(({ uci, book, risk }) => [uci, book ?? false, risk]);

describe('mergeChapters', () => {
  it('writes a lesson the checker accepts', () => {
    expect(checkLesson(lesson)).toEqual([]);
  });

  it('groups chapter variations by the title before the colon, joining (I) and (II)', () => {
    expect(lesson.variations).toEqual({
      test: { name: 'Caro-Kann' },
      'advance-variation': { name: 'Advance Variation', parent: 'test' },
      'advance-variation-short-variation': { name: 'Advance Variation: Short Variation', parent: 'advance-variation' },
      'classical-variation': { name: 'Classical Variation', parent: 'test' },
      'classical-variation-capablanca': { name: 'Classical Variation: Capablanca', parent: 'classical-variation' },
    });
  });

  it("names a shared position after the opening, and one chapter's after that chapter", () => {
    expect(at('e4', 'c6', 'd4', 'd5').variation).toBe('test');
    expect(at('e4', 'c6', 'd4', 'd5', 'e5').variation).toBe('advance-variation-short-variation');
  });

  it("names a side line after where it leaves the main line, but no wider than its chapter's group", () => {
    expect(at('e4', 'c6', 'Nc3').variation).toBe('advance-variation');
    expect(at('e4', 'c6', 'd4', 'd5', 'e5', 'Bf5', 'g4').variation).toBe('advance-variation-short-variation');
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
    expect(moves('e4', 'c6', 'd4', 'd5', 'e5', 'Bf5', 'Nf3', 'Qb6', 'Nc3')).toEqual([['e7e6', false, undefined]]);
  });

  it('adds sequences from comment text in the variation they leave from', () => {
    expect(at('e4', 'c6', 'd4', 'd5', 'e5', 'Bf5', 'Nf3', 'e6', 'Be2', 'Nd7')).toEqual({
      variation: 'advance-variation-short-variation',
      moves: [{ uci: 'e1g1' }],
    });
  });

  it('leaves out positions where the guide stops', () => {
    expect(at('e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4', 'Bf5')).toBeUndefined();
  });
});
