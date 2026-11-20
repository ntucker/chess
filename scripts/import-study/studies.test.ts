import { describe, expect, it } from '@jest/globals';

import { lessonInfo, STUDIES } from './studies';

describe('lessonInfo', () => {
  it('credits a study the recipe reads twice once, where it first comes', () => {
    const recipe = STUDIES.sicilian;
    expect(recipe.from.filter((from) => 'study' in from && from.study === 'lUPzQLo3')).toHaveLength(
      2,
    );
    expect(lessonInfo(recipe).sources.map(({ author }) => author)).toEqual([
      'loloriv',
      'andrew_tsiri',
      'Wikibooks contributors',
    ]);
  });
});
