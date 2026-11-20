import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { readShippedLesson, shippedIds } from '@/lesson/lesson.fixture';
import { pathNames, variationPath } from '@/lesson/select';

import { PLACE_TYPE } from './Header';

/** A length the narrow page's media query in narrow.css sets, in pixels. */
function narrowPixels(name: string) {
  const css = readFileSync(join(__dirname, '../theme/narrow.css'), 'utf8');
  const narrow = css.slice(css.indexOf('@media (max-width:'));
  return Number(narrow.match(new RegExp(`--${name}: (\\d+)px;`))![1]);
}

/**
 * The width a 360px page's header leaves its place: the page less its
 * padding each side, the logo (as tall as the header), the source link,
 * and Header.tsx's gaps of 8 and 12.
 */
const PLACE_AT_360 =
  360 -
  2 * narrowPixels('page-space') -
  narrowPixels('header-height') -
  narrowPixels('source-link-size') -
  8 -
  12;

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
    // The export measured 264 at 360px; this sum must keep up with the header's layout.
    expect(PLACE_AT_360).toBe(264);
    expect(tooLong).toEqual([]);
  });
});
