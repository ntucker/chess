import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { MotionElement, Point } from './dom';

// A fake engine: where each element is comes from `mockLayout`, and every call is recorded.
const mockLayout = new Map<MotionElement, Point>();
const mockCalls: [string, ...unknown[]][] = [];
function mockCall(name: string, args: unknown[], result?: unknown) {
  mockCalls.push([name, ...args]);
  return result;
}
jest.mock('./dom', () => ({
  measureOf: (el: MotionElement) => ({
    at: mockLayout.get(el),
    velocity: { x: 0, y: 0 },
    width: 10,
    height: 10,
  }),
  glide: (...args: unknown[]) => mockCall('glide', args, Promise.resolve()),
  stop: (...args: unknown[]) => mockCall('stop', args),
  lift: (...args: unknown[]) => mockCall('lift', args),
  arrive: (...args: unknown[]) => mockCall('arrive', args),
  leave: (...args: unknown[]) => mockCall('leave', args),
}));

// eslint-disable-next-line import/first -- after the mock it replaces
import { measure, reorder } from './reorder';
// eslint-disable-next-line import/first
import { springs } from './spring';

function element(at: Point, parent: MotionElement | null = null): MotionElement {
  const el: MotionElement = {
    parentElement: parent,
    contains: (other) => {
      for (let up: MotionElement | null = other; up; up = up.parentElement)
        if (up === el) return true;
      return false;
    },
  };
  mockLayout.set(el, at);
  return el;
}

const named = (name: string) =>
  mockCalls.filter(([call]) => call === name).map(([, ...args]) => args);

beforeEach(() => {
  mockLayout.clear();
  mockCalls.length = 0;
});

describe('reorder', () => {
  it('glides a moved item from where it was', () => {
    const row = element({ x: 0, y: 0 });
    const before = measure(new Map([['a', row]]));
    mockLayout.set(row, { x: 0, y: 40 });
    reorder(before, new Map([['a', row]]), springs.brisk, { fades: true });
    expect(named('glide')).toEqual([[row, springs.brisk, { x: 0, y: -40 }, { x: 0, y: 0 }]]);
  });

  it('moves an item inside a moving one only the rest of the way', () => {
    const group = element({ x: 0, y: 0 });
    const row = element({ x: 0, y: 10 }, group);
    const items = new Map([
      ['group', group],
      ['row', row],
    ]);
    const before = measure(items);
    mockLayout.set(group, { x: 0, y: 100 });
    mockLayout.set(row, { x: 0, y: 130 });
    reorder(before, items, springs.brisk, { fades: true });
    const from = new Map(named('glide').map(([el, , offset]) => [el, offset]));
    expect(from.get(group)).toEqual({ x: 0, y: -100 });
    expect(from.get(row)).toEqual({ x: 0, y: -20 });
  });

  it('fades in a new item, but not one taking the spot of one that left', () => {
    const kept = element({ x: 0, y: 0 });
    const gone = element({ x: 0, y: 20 });
    const before = measure(
      new Map([
        ['kept', kept],
        ['old id', gone],
      ]),
    );
    const renamed = element({ x: 0, y: 20 });
    const added = element({ x: 0, y: 40 });
    reorder(
      before,
      new Map([
        ['kept', kept],
        ['new id', renamed],
        ['added', added],
      ]),
      springs.brisk,
      { fades: true },
    );
    expect(named('arrive')).toEqual([[added, springs.brisk]]);
    expect(named('leave')).toEqual([[[]]]);
  });

  it('fades out an item that left where it was, and only that one', () => {
    const kept = element({ x: 0, y: 0 });
    const gone = element({ x: 0, y: 20 });
    const before = measure(
      new Map([
        ['kept', kept],
        ['gone', gone],
      ]),
    );
    reorder(before, new Map([['kept', kept]]), springs.brisk, { fades: true });
    expect(named('leave')).toEqual([
      [[expect.objectContaining({ el: gone, at: { x: 0, y: 20 } })]],
    ]);
  });

  it('lifts an item crossing another, not the one it nudges', () => {
    const first = element({ x: 0, y: 0 });
    const second = element({ x: 0, y: 20 });
    const items = new Map([
      ['first', first],
      ['second', second],
    ]);
    const before = measure(items);
    mockLayout.set(first, { x: 0, y: 20 });
    mockLayout.set(second, { x: 0, y: 0 });
    reorder(before, items, springs.brisk, { fades: true });
    expect(named('lift').filter(([, lifted]) => lifted)).toEqual([
      [first, true],
      [second, true],
    ]);
  });

  it('without fades, still glides a moved item but lets arrivals and leavers come and go', () => {
    const moved = element({ x: 0, y: 0 });
    const gone = element({ x: 0, y: 20 });
    const before = measure(
      new Map([
        ['moved', moved],
        ['gone', gone],
      ]),
    );
    mockLayout.set(moved, { x: 0, y: 40 });
    const added = element({ x: 0, y: 80 });
    reorder(
      before,
      new Map([
        ['moved', moved],
        ['added', added],
      ]),
      springs.brisk,
      { fades: false },
    );
    expect(named('glide')).toEqual([[moved, springs.brisk, { x: 0, y: -40 }, { x: 0, y: 0 }]]);
    expect(named('arrive')).toEqual([]);
    expect(named('leave')).toEqual([]);
  });

  it('keeps a crossing item lifted when another commit interrupts its glide', () => {
    const first = element({ x: 0, y: 0 });
    const second = element({ x: 0, y: 20 });
    const items = new Map([
      ['first', first],
      ['second', second],
    ]);
    const swapped = measure(items);
    mockLayout.set(first, { x: 0, y: 20 });
    mockLayout.set(second, { x: 0, y: 0 });
    reorder(swapped, items, springs.brisk, { fades: true });
    // mid-glide, each has already passed the other: by position alone neither crosses now
    mockLayout.set(first, { x: 0, y: 15 });
    mockLayout.set(second, { x: 0, y: 5 });
    const midway = measure(items);
    mockLayout.set(first, { x: 0, y: 20 });
    mockLayout.set(second, { x: 0, y: 0 });
    mockCalls.length = 0;
    reorder(midway, items, springs.brisk, { fades: false });
    expect(named('lift').filter(([, lifted]) => lifted)).toEqual([
      [first, true],
      [second, true],
    ]);
  });
});
