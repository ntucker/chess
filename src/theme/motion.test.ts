import { describe, expect, it } from '@jest/globals';

import { springMotion, springOffset } from '@/theme/motion';

/** The easing's progress values, in order. */
const samples = (easing: string) => easing.slice('linear('.length, -1).split(', ').map(Number);

describe('springOffset', () => {
  it('starts away from the target and comes to it', () => {
    const spring = { duration: 0.4, bounce: 0.3 };
    expect(springOffset(spring, 0)).toBe(1);
    expect(Math.abs(springOffset(spring, 2))).toBeLessThan(0.001);
  });
});

describe('springMotion', () => {
  it('goes from 0 to 1 without passing it when there is no bounce', () => {
    const { durationMs, easing } = springMotion({ duration: 0.4, bounce: 0 });
    const progress = samples(easing);
    expect(progress[0]).toBe(0);
    expect(progress.at(-1)).toBe(1);
    expect(Math.max(...progress)).toBe(1);
    expect(durationMs).toBe(Math.round(((progress.length - 1) / 60) * 1000));
  });

  it('passes the target and comes back when it bounces', () => {
    const { durationMs, easing } = springMotion({ duration: 0.4, bounce: 0.35 });
    const progress = samples(easing);
    expect(Math.max(...progress)).toBeGreaterThan(1.05);
    expect(progress.at(-1)).toBe(1);
    // Longer than the time to reach the target, since the bounces follow it.
    expect(durationMs).toBeGreaterThan(400);
    expect(durationMs).toBeLessThan(1500);
  });
});
