import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { revealOffset, SETTLE_MS, scrollTracker } from './scoresheetReveal';

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

describe('scrollTracker', () => {
  const row = (y: number) => ({ y, height: 30 });
  let tracker: ReturnType<typeof scrollTracker>;

  beforeEach(() => {
    jest.useFakeTimers();
    tracker = scrollTracker();
    tracker.resized(280);
  });

  afterEach(() => {
    tracker.dispose();
    jest.useRealTimers();
  });

  it('reckons from where its own scroll is heading while the scroll passes other offsets', () => {
    expect(tracker.reveal(row(750))).toBe(500);
    // The animation has only just left 0: the row at 100 shows now, but not at 500.
    tracker.scrolled(10);
    expect(tracker.reveal(row(100))).toBe(100);
  });

  it('reckons from where the list is once its scroll arrives', () => {
    expect(tracker.reveal(row(750))).toBe(500);
    tracker.scrolled(250);
    tracker.scrolled(500);
    expect(tracker.reveal(row(400))).toBe(400);
  });

  it('reckons from where the player takes the list, while they still scroll it', () => {
    expect(tracker.reveal(row(750))).toBe(500);
    tracker.scrolled(100);
    // The player drags it back up, and keeps scrolling past the quiet time.
    for (let top = 90; top >= 0; top -= 10) {
      tracker.scrolled(top);
      jest.advanceTimersByTime(16);
    }
    expect(tracker.reveal(row(600))).toBe(350);
  });

  it('reckons from where the list stopped once its scroll events go quiet', () => {
    expect(tracker.reveal(row(750))).toBe(500);
    // The player stopped the scroll at 40 with a tap.
    tracker.scrolled(40);
    jest.advanceTimersByTime(SETTLE_MS);
    expect(tracker.reveal(row(100))).toBeUndefined();
  });

  it('follows the list where the player scrolls it', () => {
    tracker.scrolled(300);
    expect(tracker.reveal(row(100))).toBe(100);
  });
});
