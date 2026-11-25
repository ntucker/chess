import { describe, expect, it } from '@jest/globals';

import { SAVED_SIDE_CSS } from './savedSide';

describe('SAVED_SIDE_CSS', () => {
  it("turns a marked board and its pieces for the side that isn't the default", () => {
    document.head.innerHTML = `<style>${SAVED_SIDE_CSS}</style>`;
    document.body.innerHTML = '<div data-still="saved-side"><svg></svg></div>';
    const board = document.querySelector('div')!;
    const piece = document.querySelector('svg')!;
    expect(getComputedStyle(board).transform).toBe('');
    document.documentElement.dataset.side = 'black';
    expect(getComputedStyle(board).transform).toBe('');
    document.documentElement.dataset.side = 'white';
    expect(getComputedStyle(board).transform).toBe('rotate(180deg)');
    expect(getComputedStyle(piece).transform).toBe('rotate(180deg)');
  });
});
