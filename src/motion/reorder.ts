/**
 * Lists that rearrange: measure items by key before a change, then glide
 * each from where it was to where it is (FLIP, translate only), on either
 * platform's engine (from data-client's website/src/components/motion/reorder.ts).
 */
import { arrive, glide, leave, lift, measureOf, stop } from './engine';
import type { Spring } from './spring';
import type { MotionElement, Point, Position } from './types';

/** Elements under keys that stay the same from one render to the next (an item's id) */
export type Items = ReadonlyMap<unknown, MotionElement>;
export type Positions = ReadonlyMap<unknown, Position>;

/** Reads where `items` are, before a change moves them */
export function measure(items: Items): Positions {
  const positions = new Map<unknown, Position>();
  for (const [key, el] of items)
    positions.set(key, { ...measureOf(el), el, parent: el.parentElement });
  return positions;
}

/**
 * Glides each item from where `before` saw its key to where it is now, so an
 * item React put under another parent travels there too. An item inside
 * another that moves rides along and travels only the rest of the way. A key
 * `before` lacks fades in (unless it takes the exact spot of a key that just
 * left: the same item under a new id); a key that left fades out where it
 * was. Items crossing the others are lifted over them until they land.
 */
export function reorder(before: Positions, items: Items, spring: Spring) {
  // the final layout, without glides in flight, before measuring it
  for (const el of items.values()) {
    stop(el);
    lift(el, false);
  }
  const moves = new Map<MotionElement, { offset: Point; velocity: Point; was: Point; at: Point }>();
  const arrivals: MotionElement[] = [];
  const left = [...before].filter(([key]) => !items.has(key)).map(([, position]) => position);
  for (const [key, el] of items) {
    const was = before.get(key);
    const { at } = measureOf(el);
    if (!was) {
      if (!takeSpot(left, at)) arrivals.push(el);
      continue;
    }
    moves.set(el, {
      offset: { x: was.at.x - at.x, y: was.at.y - at.y },
      velocity: was.velocity,
      was: was.at,
      at,
    });
  }
  // every read is done: start the animations
  const glides = [...moves].map(([el, { offset, velocity }]) => {
    const carrier = carrierOf(el, moves);
    const carried = carrier && moves.get(carrier)?.offset;
    const from = carried ? { x: offset.x - carried.x, y: offset.y - carried.y } : offset;
    return { el, from, velocity, length: Math.hypot(from.x, from.y) };
  });
  const farthest = Math.max(0, ...glides.map(({ length }) => length));
  for (const { el, from, velocity, length } of glides) {
    const finished = glide(el, spring, from, velocity);
    if (finished && length >= farthest / 2 && length > NUDGE && passesAnother(el, moves)) {
      lift(el, true);
      finished.then(() => {
        if (!crossing.has(el) || crossing.get(el) === finished) lift(el, false);
      });
      crossing.set(el, finished);
    }
  }
  for (const position of left) leave(position);
  // an arrival holding an item that moves in shows at once, or its fade would hide that glide
  for (const el of arrivals)
    if (!glides.some(({ el: item }) => el.contains(item))) arrive(el, spring);
}

/** The latest crossing glide of each lifted item: an older one landing leaves it lifted */
const crossing = new WeakMap<MotionElement, Promise<void>>();

/** px: a move this short crosses nothing */
const NUDGE = 1;

/** Whether `el` changed sides with another item that stayed, not only slid into a gap */
function passesAnother(
  el: MotionElement,
  items: ReadonlyMap<MotionElement, { was: Point; at: Point }>,
) {
  const { was, at } = items.get(el)!;
  for (const [other, them] of items) {
    if (other === el || other.contains(el) || el.contains(other)) continue;
    for (const axis of ['x', 'y'] as const) {
      const before = side(was[axis] - them.was[axis]);
      const after = side(at[axis] - them.at[axis]);
      if (before && after && before !== after) return true;
    }
  }
  return false;
}
const side = (d: number) => (Math.abs(d) <= NUDGE ? 0 : Math.sign(d));

/** Whether `at` is where one of `spots` was (removing it, so it's taken once) */
function takeSpot(spots: Position[], at: Point) {
  const i = spots.findIndex(({ at: spot }) => Math.hypot(spot.x - at.x, spot.y - at.y) <= NUDGE);
  if (i !== -1) spots.splice(i, 1);
  return i !== -1;
}

/** The nearest moving item `el` is inside, if any */
function carrierOf(el: MotionElement, moving: ReadonlyMap<MotionElement, unknown>) {
  for (let up = el.parentElement; up; up = up.parentElement) if (moving.has(up)) return up;
}
