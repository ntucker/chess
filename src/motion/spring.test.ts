import { describe, expect, it } from '@jest/globals';

import { atRest, sampleSpring, springAt, springMotion, springs } from './spring';

describe('springAt', () => {
  it('starts where it was told, at the speed it was told', () => {
    const { offset, velocity } = springAt(springs.snappy, { offset: 10, velocity: 3 }, 0);
    expect(offset).toBe(10);
    expect(velocity).toBeCloseTo(3);
  });

  it('comes to rest at the target', () => {
    for (const spring of Object.values(springs))
      expect(
        atRest(springAt(spring, { offset: 100, velocity: 0 }, spring.duration * 4), 0.25),
      ).toBe(true);
  });

  it('overshoots only with bounce', () => {
    const lowest = (spring: { duration: number; bounce: number }) =>
      Math.min(...sampleSpring(spring, { offset: 1, velocity: 0 }, 0.001));
    expect(lowest(springs.smooth)).toBeGreaterThanOrEqual(0);
    expect(lowest(springs.snappy)).toBeLessThan(0);
  });

  it('keeps momentum that points away from the target', () => {
    // moving away at first, as a reversal mid-flight does
    expect(springAt(springs.brisk, { offset: 10, velocity: 500 }, 1 / 60).offset).toBeGreaterThan(
      10,
    );
  });
});

describe('springMotion', () => {
  it('is a CSS linear() easing from 0 to 1 and its length', () => {
    const { durationMs, easing } = springMotion(springs.smooth);
    const stops = /^linear\((.*)\)$/.exec(easing)![1].split(', ').map(Number);
    expect(stops[0]).toBe(0);
    expect(stops.at(-1)).toBe(1);
    expect(durationMs).toBe(Math.round(((stops.length - 1) / 60) * 1000));
    expect(Math.max(...stops)).toBe(1);
  });

  it('passes the target and comes back when it bounces', () => {
    const { durationMs, easing } = springMotion({ duration: 0.4, bounce: 0.35 });
    const stops = /^linear\((.*)\)$/.exec(easing)![1].split(', ').map(Number);
    expect(Math.max(...stops)).toBeGreaterThan(1.05);
    expect(stops.at(-1)).toBe(1);
    // Longer than the time to reach the target, since the bounces follow it.
    expect(durationMs).toBeGreaterThan(400);
    expect(durationMs).toBeLessThan(1500);
  });
});
