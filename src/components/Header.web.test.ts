import { describe, expect, it, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { readShippedLesson, shippedIds } from '@/lesson/lesson.fixture';
import { pathNames, variationPath } from '@/lesson/select';

import {
  EM_PER_CHARACTER,
  LONE_NAME_LINE,
  NAME_LINE,
  PARENT_LINE,
  PLACE_CHROME,
  SMALLEST_NAME_SIZE,
} from './Header';

// Jest can't load a stylesheet; this test reads it as text instead.
jest.mock('@/theme/narrow.css', () => ({}));

const css = readFileSync(join(__dirname, '../theme/narrow.css'), 'utf8');
/** A length narrow.css sets, in pixels. */
const narrow = (name: string) => Number(css.match(new RegExp(`--${name}: (\\d+)px;`))![1]);
/** A NarrowLength's CSS worked out with narrow.css's lengths. */
const narrowPixels = (expression: string) =>
  // Only sums and products of pixel lengths, from narrowLength's own methods.
  new Function(
    `return ${expression.replace(/var\(--([a-z-]+), [\d.]+px\)/g, (_, name: string) => String(narrow(name))).replace(/px/g, '')}`,
  )() as number;

describe('the narrow header place', () => {
  it('fits its lines in the header, so the board never moves', () => {
    expect(PARENT_LINE + NAME_LINE).toBeLessThanOrEqual(narrow('header-height'));
    expect(LONE_NAME_LINE).toBeLessThanOrEqual(narrow('header-height'));
  });

  it("fits every shipped line's name on a 360px page by its estimate", () => {
    const width = 360 - narrowPixels(PLACE_CHROME.css);
    const tooLong = shippedIds.flatMap((id) => {
      const lesson = readShippedLesson(id);
      return Object.keys(lesson.variations)
        .map((variation) => pathNames(variationPath(lesson, variation)).at(-1)!)
        .filter((name) => name.length * EM_PER_CHARACTER * SMALLEST_NAME_SIZE > width);
    });
    expect(width).toBe(264);
    expect(tooLong).toEqual([]);
  });
});
