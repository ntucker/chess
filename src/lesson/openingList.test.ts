import { describe, expect, it } from '@jest/globals';

import { LESSON_INDEX } from '@/resources/lesson';

import { listPlace, openingList, type ListedVariation } from './openingList';
import { variationLine } from './openings';

const list = openingList(LESSON_INDEX);
const caro = list.black.find(({ id }) => id === 'caro-kann')!;
const named = (variations: readonly ListedVariation[], name: string) =>
  variations.find((variation) => variation.name === name)!;

describe('openingList', () => {
  it("lists each side's openings in the index's order", () => {
    expect(list.white.map(({ id }) => id)).toEqual(['london']);
    expect(list.black.map(({ id }) => id)).toEqual(['caro-kann', 'slav', 'anti-london']);
  });

  it('roots each opening at its own variation, with the moves that pick it', () => {
    expect(caro.root).toMatchObject({ id: 'caro-kann', name: 'Caro-Kann Defence', line: '1.e4' });
  });

  it("nests variations under their parents, named without the parent's name, moves past the parent's", () => {
    const advance = named(caro.root.children, 'Advance Variation');
    expect(advance.line).toBe('1...c6 2.d4 d5 3.e5');
    expect(named(advance.children, 'Short Variation, Main Line').line).toMatch(/^3\.\.\./);
  });

  it('lists every variation of the index once', () => {
    const ids = (variation: ListedVariation): string[] => [
      variation.id,
      ...variation.children.flatMap(ids),
    ];
    for (const opening of [...list.white, ...list.black])
      expect(ids(opening.root).sort()).toEqual(
        LESSON_INDEX[opening.id].variations.map(({ id }) => id).sort(),
      );
  });
});

describe('variationLine', () => {
  it('opens a variation at its line, and none for an unknown one', () => {
    const slav = LESSON_INDEX.slav;
    expect(variationLine(slav, 'semi-slav')).toBe(
      slav.variations.find(({ id }) => id === 'semi-slav')!.moves,
    );
    expect(variationLine(slav, 'nope')).toBeUndefined();
    expect(variationLine(slav)).toBeUndefined();
  });
});

describe('listPlace', () => {
  it('keeps the lesson and variation an address names, when the index has them', () => {
    expect(listPlace(LESSON_INDEX, 'slav', 'semi-slav')).toEqual({
      lesson: 'slav',
      variation: 'semi-slav',
    });
    expect(listPlace(LESSON_INDEX, 'slav', 'nope')).toEqual({ lesson: 'slav' });
    expect(listPlace(LESSON_INDEX, 'nope', 'semi-slav')).toBeUndefined();
    expect(listPlace(LESSON_INDEX)).toBeUndefined();
  });
});
