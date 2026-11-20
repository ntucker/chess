/**
 * Moving DOM elements on the web: Web Animations with keyframes sampled from
 * the spring, so the browser runs them on the compositor (from data-client's
 * website/src/components/motion/glide.ts and reorder.ts). React Native Web
 * renders a `MotionView` as a DOM element, which these animate directly.
 */
import {
  atRest,
  sampleSpring,
  SAMPLE_RATE,
  springAt,
  springMotion,
  type Spring,
  type SpringState,
} from './spring';
import { ORIGIN, type MotionElement, type Point, type Position } from './types';

interface Glide {
  animation: Animation;
  spring: Spring;
  start: readonly [x: SpringState, y: SpringState];
  finished: Promise<void>;
}
const glides = new WeakMap<Element, Glide>();

const dom = (el: MotionElement) => el as unknown as HTMLElement;

const noop = () => undefined;

/** Whether `el` can move at all (jsdom has no Web Animations) */
export const canAnimate = (el: MotionElement) => typeof dom(el).animate === 'function';

/** Where `el` is on screen now, a glide in flight included, and its size */
export function measureOf(el: MotionElement): Omit<Position, 'el' | 'parent'> {
  const { left, top, width, height } = dom(el).getBoundingClientRect();
  return { at: { x: left, y: top }, velocity: velocityOf(el), width, height };
}

/**
 * Springs `el`'s `translate` from `from` to where layout puts it, keeping
 * `velocity` (px/s). Resolves once it lands or another glide replaces it.
 */
export function glide(el: MotionElement, spring: Spring, from: Point, velocity: Point = ORIGIN) {
  stop(el);
  const node = dom(el);
  if (!canAnimate(el)) return;
  if (!from.x && !from.y && !velocity.x && !velocity.y) return;
  const start = [
    { offset: from.x, velocity: velocity.x },
    { offset: from.y, velocity: velocity.y },
  ] as const;
  const [xs, ys] = start.map((axis) => sampleSpring(spring, axis, PRECISION));
  const frames = Math.max(xs.length, ys.length);
  const keyframes = Array.from({ length: frames }, (_, i) => ({
    translate: `${xs[i] ?? 0}px ${ys[i] ?? 0}px`,
  }));
  const animation = node.animate(keyframes, { duration: ((frames - 1) / SAMPLE_RATE) * 1000 });
  const finished = animation.finished.then(noop, noop);
  glides.set(node, { animation, spring, start, finished });
  return finished;
}

/** How fast `el`'s glide is moving it right now (px/s) */
export function velocityOf(el: MotionElement): Point {
  const current = glides.get(dom(el));
  if (!current || current.animation.playState === 'finished') return ORIGIN;
  const { animation, spring, start } = current;
  const t = Number(animation.currentTime ?? 0) / 1000;
  const [x, y] = start.map((axis) => springAt(spring, axis, t));
  return atRest(x, PRECISION) && atRest(y, PRECISION) ? ORIGIN : { x: x.velocity, y: y.velocity };
}

/** Ends `el`'s glide, snapping it back to its layout position */
export function stop(el: MotionElement) {
  const node = dom(el);
  glides.get(node)?.animation.cancel();
  glides.delete(node);
}

/** Raises `el` over its siblings while it crosses them */
export function lift(el: MotionElement, lifted: boolean) {
  dom(el).style.zIndex = lifted ? '1' : '';
}

const ARRIVE: Keyframe[] = [{ opacity: 0 }, { opacity: 1 }];

/** Fades a new item in */
export function arrive(el: MotionElement, spring: Spring) {
  if (!canAnimate(el)) return;
  const { durationMs, easing } = springMotion(spring);
  dom(el).animate(ARRIVE, { duration: durationMs, easing });
}

// Quicker than the glide into its place, so its text is mostly gone before
// the item taking its place gets there.
const LEAVE: Keyframe[] = [{ opacity: 1 }, { opacity: 0, translate: '-12px 0' }];
const LEAVE_TIMING: KeyframeAnimationOptions = {
  duration: 160,
  easing: 'ease-out',
  fill: 'forwards',
};

/**
 * Puts an item React removed back where it was, out of the flow and out of
 * reach, while it fades out.
 */
export function leave({ el, parent, at, width, height }: Position) {
  const node = dom(el);
  const list = parent && dom(parent);
  // React kept it (it moved under another key), or its list left too
  if (node.isConnected || !list?.isConnected || !canAnimate(el)) return;
  stop(el);
  lift(el, false);
  node.inert = true;
  node.setAttribute('aria-hidden', 'true');
  Object.assign(node.style, {
    position: 'absolute',
    boxSizing: 'border-box',
    margin: '0',
    left: '0',
    top: '0',
    width: `${width}px`,
    height: `${height}px`,
    pointerEvents: 'none',
    zIndex: '2',
  });
  list.append(node);
  const origin = node.getBoundingClientRect();
  node.style.left = `${at.x - origin.left}px`;
  node.style.top = `${at.y - origin.top}px`;
  const gone = () => node.remove();
  node.animate(LEAVE, LEAVE_TIMING).finished.then(gone, gone);
}

/** Sub-pixel: settles once the remaining motion is invisible */
const PRECISION = 0.25;
