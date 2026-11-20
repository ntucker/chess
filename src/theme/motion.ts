/**
 * Springs, described the way people see them: how long the motion takes and
 * how much it bounces. `springMotion` turns one into a duration and a CSS
 * `linear()` easing, the shape of the theme's own motion tokens, which a CSS
 * animation plays on the web and on Android alike. Ported from the motion
 * helpers of reactive/data-client's website. Imports nothing, so the tests
 * can load it.
 */
export interface Spring {
  /** Seconds to reach the target, not counting the bounces after it. */
  readonly duration: number;
  /** 0 never passes the target; toward 1 it bounces more. */
  readonly bounce: number;
}

/** How far a spring let go at 1 still is from its target at 0, `t` seconds on (mass 1). */
export function springOffset({ duration, bounce }: Spring, t: number): number {
  const omega = (2 * Math.PI) / duration;
  const zeta = 1 - bounce;
  const decay = Math.exp(-zeta * omega * t);
  if (zeta >= 1) return decay * (1 + omega * t);
  const damped = omega * Math.sqrt(1 - zeta * zeta);
  return decay * (Math.cos(damped * t) + ((zeta * omega) / damped) * Math.sin(damped * t));
}

const SAMPLES_PER_SECOND = 60;
/** A spring is cut off here if it hasn't come to rest. */
const LONGEST_SECONDS = 4;
/** At rest: this close to the target, and staying there for a tenth of a second. */
const REST = 0.001;

/** The spring let go from rest, as an animation's length and its `linear()` easing. */
export function springMotion(spring: Spring): { durationMs: number; easing: string } {
  const offsets = [1];
  const resting = (from: number) => {
    for (let frame = from; frame < from + SAMPLES_PER_SECOND / 10; frame++) {
      if (Math.abs(springOffset(spring, frame / SAMPLES_PER_SECOND)) >= REST) return false;
    }
    return true;
  };
  for (let frame = 1; frame < LONGEST_SECONDS * SAMPLES_PER_SECOND && !resting(frame); frame++) {
    offsets.push(springOffset(spring, frame / SAMPLES_PER_SECOND));
  }
  offsets.push(0);
  const progress = offsets.map((offset) => Math.round((1 - offset) * 1e4) / 1e4);
  return {
    durationMs: Math.round(((offsets.length - 1) / SAMPLES_PER_SECOND) * 1000),
    easing: `linear(${progress.join(', ')})`,
  };
}
