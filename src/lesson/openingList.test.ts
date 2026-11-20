import { describe, expect, it } from '@jest/globals';

import { LESSON_INDEX } from '@/resources/lesson';

import { FIXTURE_INDEX } from './openings.fixture';
import { listPlace, openingList, type ListedVariation } from './openingList';

const list = openingList(FIXTURE_INDEX);
const caro = list.black.find(({ id }) => id === 'caro-kann')!;
const named = (variations: readonly ListedVariation[], name: string) =>
  variations.find((variation) => variation.name === name)!;
const ids = (variation: ListedVariation): string[] => [
  variation.id,
  ...variation.children.flatMap(ids),
];

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
    expect(named(advance.children, 'Short Variation').line).toBe('3...Bf5 4.Nf3');
  });

  it('lists every shipped opening once, in the index order, and each of its variations once', () => {
    const shipped = openingList(LESSON_INDEX);
    const listed = [...shipped.white, ...shipped.black];
    expect(listed.map(({ id }) => id).sort()).toEqual(Object.keys(LESSON_INDEX).sort());
    for (const side of ['white', 'black'] as const)
      expect(shipped[side].map(({ id }) => id)).toEqual(
        Object.entries(LESSON_INDEX)
          .filter(([, entry]) => entry.side === side)
          .map(([id]) => id),
      );
    for (const opening of listed)
      expect(ids(opening.root).sort()).toEqual(
        LESSON_INDEX[opening.id].variations.map(({ id }) => id).sort(),
      );
  });
});

describe('listPlace', () => {
  it('keeps the lesson and variation an address names, when the index has them', () => {
    expect(listPlace(FIXTURE_INDEX, 'slav', 'semi-slav')).toEqual({
      lesson: 'slav',
      variation: 'semi-slav',
    });
    expect(listPlace(FIXTURE_INDEX, 'slav', 'nope')).toEqual({ lesson: 'slav' });
    expect(listPlace(FIXTURE_INDEX, 'nope', 'semi-slav')).toBeUndefined();
    expect(listPlace(FIXTURE_INDEX)).toBeUndefined();
  });
});
