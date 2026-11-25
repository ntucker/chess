import { describe, expect, it } from '@jest/globals';

import { revealOffset } from './scoresheetReveal';

describe('revealOffset', () => {
  const viewport = { top: 100, height: 60 };

  it('scrolls a row above the viewport to its top', () => {
    expect(revealOffset({ y: 80, height: 30 }, viewport)).toBe(80);
  });

  it('scrolls a row below the viewport just far enough to show its bottom', () => {
    expect(revealOffset({ y: 150, height: 30 }, viewport)).toBe(120);
  });

  it('leaves a row that already shows whole', () => {
    expect(revealOffset({ y: 110, height: 30 }, viewport)).toBeUndefined();
  });

  it('waits for the viewport to have a height', () => {
    expect(revealOffset({ y: 150, height: 30 }, { top: 0, height: 0 })).toBeUndefined();
  });
});
