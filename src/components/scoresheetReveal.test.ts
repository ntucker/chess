import { describe, expect, it, jest } from '@jest/globals';

import { revealOffset, scrollTracker } from './scoresheetReveal';

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

  it('reckons from where its own scroll is heading while the scroll events pass other offsets', () => {
    jest.useFakeTimers();
    const tracker = scrollTracker(150);
    tracker.resized(280);
    expect(tracker.reveal(row(750))).toBe(500);
    // The animation has only just left 0: the row at 100 shows now, but not at 500.
    tracker.scrolled(10);
    expect(tracker.reveal(row(100))).toBe(100);
    tracker.dispose();
    jest.useRealTimers();
  });

  it('reckons from where the list is once its scroll events go quiet', () => {
    jest.useFakeTimers();
    const tracker = scrollTracker(150);
    tracker.resized(280);
    expect(tracker.reveal(row(750))).toBe(500);
    // The player stopped the scroll at 40 with a drag.
    tracker.scrolled(40);
    jest.advanceTimersByTime(150);
    expect(tracker.reveal(row(100))).toBeUndefined();
    jest.useRealTimers();
  });

  it('follows the list where the player scrolls it', () => {
    const tracker = scrollTracker(150);
    tracker.resized(280);
    tracker.scrolled(300);
    expect(tracker.reveal(row(100))).toBe(100);
    tracker.dispose();
  });
});
