import { describe, expect, it } from '@jest/globals';

import { sourceNamer } from './credits';

const study = (author: string, url = `https://lichess.org/study/${author}`) => ({
  title: 'A study',
  author,
  url,
});

describe('sourceNamer', () => {
  it.each([
    ['https://lichess.org/study/abcd1234', "Matkun's lichess study"],
    ['http://lichess.org/study/abcd1234', "Matkun's lichess study"],
    ['https://www.lichess.org/study/abcd1234', "Matkun's lichess study"],
    ['https://lichess.org/@/Matkun', 'A study by Matkun'],
    ['https://lichess.org.example.com/study/abcd1234', 'A study by Matkun'],
  ])('names %s as %s', (url, name) => {
    const source = study('Matkun', url);
    expect(sourceNamer([source])(source)).toBe(name);
  });
});
