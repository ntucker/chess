import { describe, expect, it } from '@jest/globals';

import { SAVED_SIDE_CSS, SAVED_SIDE_SCRIPT } from './savedSide';

/** <html data-side> after the script runs with `text` saved as the settings. */
function run(text: string | null, storage: 'works' | 'blocked' = 'works') {
  const dataset: { side?: string } = {};
  const localStorage = {
    getItem: (key: string) => {
      if (storage === 'blocked') throw new Error('SecurityError');
      return key === 'settings' ? text : null;
    },
  };
  new Function('localStorage', 'document', SAVED_SIDE_SCRIPT)(localStorage, {
    documentElement: { dataset },
  });
  return dataset.side;
}

describe('SAVED_SIDE_SCRIPT', () => {
  it('names the side the learner saved, and nothing else', () => {
    expect(run('{"side":"white"}')).toBe('white');
    expect(run('{"side":"black","theme":"dark"}')).toBe('black');
    for (const text of [null, 'x', 'null', '{}', '{"side":"red"}'])
      expect(run(text)).toBeUndefined();
    expect(run('{"side":"white"}', 'blocked')).toBeUndefined();
  });
});

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
