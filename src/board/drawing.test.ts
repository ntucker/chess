import { describe, expect, it } from '@jest/globals';

import { squareOffset } from './drawing';

describe('squareOffset', () => {
  it('counts from the top left corner as each side sees the board', () => {
    expect(squareOffset('a8', 'white')).toEqual([0, 0]);
    expect(squareOffset('c6', 'white')).toEqual([2, 2]);
    expect(squareOffset('a8', 'black')).toEqual([7, 7]);
    expect(squareOffset('h1', 'black')).toEqual([0, 0]);
  });
});
