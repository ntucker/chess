import { describe, expect, it } from '@jest/globals';

import { readShippedLesson, shippedIds } from '@/lesson/lesson.fixture';
import { pathNames, variationPath } from '@/lesson/select';

import { PLACE_TYPE } from './Header';

/**
 * The width a 360px page's header leaves its place: the page less its 10px
 * padding each side, the 28px logo and source link, and gaps of 8 and 12.
 */
const PLACE_AT_360 = 264;

describe('the narrow header place', () => {
  it("fits every shipped line's name on a 360px page by its estimate", () => {
    const tooLong = shippedIds.flatMap((id) => {
      const lesson = readShippedLesson(id);
      return Object.keys(lesson.variations)
        .map((variation) => pathNames(variationPath(lesson, variation)).at(-1)!)
        .filter(
          (name) => name.length * PLACE_TYPE.emPerCharacter * PLACE_TYPE.smallest > PLACE_AT_360,
        );
    });
    expect(tooLong).toEqual([]);
  });
});
