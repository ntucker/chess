/**
 * Spring physics, platform-neutral (ported from reactive/data-client's
 * website/src/components/motion/spring.ts). A spring is a damped harmonic
 * oscillator (mass 1) described the way people perceive it: how long the
 * motion takes and how much it bounces. Same model as SwiftUI's and Motion's
 * `visualDuration`/`bounce` springs.
 */

export interface Spring {
  /** Seconds to (visually) reach the target, ignoring the bounce tail */
  readonly duration: number;
  /** 0 = no overshoot (critically damped), towards 1 = springier */
  readonly bounce: number;
}

/** Offset from the target and velocity (units per second) */
export interface SpringState {
  readonly offset: number;
  readonly velocity: number;
}

/** Frame rate keyframes and `linear()` easings are sampled at */
export const SAMPLE_RATE = 60;

/** The app's motion vocabulary: pick by what moves, never by milliseconds. */
export const springs = {
  /** Small, light things: arrows, chips, toggles */
  snappy: { duration: 0.25, bounce: 0.15 },
  /** Rows trading places, arriving or leaving in a list */
  brisk: { duration: 0.3, bounce: 0.1 },
  /** Panels, sheets and drawers that carry content: no overshoot past their edge */
  smooth: { duration: 0.4, bounce: 0 },
} as const satisfies Record<string, Spring>;

/**
 * Position and velocity `t` seconds after starting at `offset` with
 * `velocity`. A worklet, so Android's UI thread runs it every frame.
 */
export function springAt(spring: Spring, start: SpringState, t: number): SpringState {
  'worklet';
  const omega = (2 * Math.PI) / spring.duration;
  const zeta = 1 - spring.bounce;
  const { offset, velocity } = start;
  const decay = Math.exp(-zeta * omega * t);
  if (zeta >= 1) {
    const b = velocity + omega * offset;
    return {
      offset: decay * (offset + b * t),
      velocity: decay * (b - omega * (offset + b * t)),
    };
  }
  const omegaD = omega * Math.sqrt(1 - zeta * zeta);
  const b = (velocity + zeta * omega * offset) / omegaD;
  const cos = Math.cos(omegaD * t);
  const sin = Math.sin(omegaD * t);
  return {
    offset: decay * (offset * cos + b * sin),
    velocity:
      decay *
      ((b * omegaD - zeta * omega * offset) * cos - (offset * omegaD + zeta * omega * b) * sin),
  };
}

/** Whether a spring this far off and this fast is within `precision` of rest (per second, at 60 fps) */
export function atRest({ offset, velocity }: SpringState, precision: number): boolean {
  'worklet';
  return Math.abs(offset) < precision && Math.abs(velocity) < precision * SAMPLE_RATE;
}

/** Safety cap for springs that barely settle (bounce near 1), in durations */
const MAX_DURATIONS = 12;

/** Offsets sampled at SAMPLE_RATE until the spring rests within `precision`; the last is exactly 0 */
export function sampleSpring(spring: Spring, start: SpringState, precision: number): number[] {
  const samples = [start.offset];
  const maxFrames = MAX_DURATIONS * spring.duration * SAMPLE_RATE;
  for (let frame = 1; frame < maxFrames; frame++) {
    const state = springAt(spring, start, frame / SAMPLE_RATE);
    if (atRest(state, precision)) break;
    samples.push(state.offset);
  }
  samples.push(0);
  return samples;
}

/**
 * The spring played from rest as a CSS `linear()` easing and its length, the
 * shape of a Silk motion token (`{ durationMs, easing }`), for CSS and
 * Reanimated CSS transitions on either platform.
 */
export function springMotion(spring: Spring): { durationMs: number; easing: string } {
  const samples = sampleSpring(spring, { offset: 1, velocity: 0 }, 0.001);
  return {
    durationMs: Math.round(((samples.length - 1) / SAMPLE_RATE) * 1000),
    easing: `linear(${samples.map((offset) => Math.round((1 - offset) * 1e4) / 1e4).join(', ')})`,
  };
}
