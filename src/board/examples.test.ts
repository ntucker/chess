import { describe, expect, it } from '@jest/globals';

import { replay } from '@/game/replay';

import type { DrawingKind } from './drawing';
import { drawingExamples } from './examples';

describe('drawingExamples', () => {
  it('plays every line to its end', () => {
    for (const { title, line } of drawingExamples) {
      expect([title, replay(line).length]).toEqual([title, line.length + 1]);
    }
  });

  it('shows every drawing kind', () => {
    const kinds = new Set(drawingExamples.flatMap(({ drawings }) => drawings.map((drawing) => drawing.kind)));
    const all: Record<DrawingKind, true> = {
      glow: true,
      arrow: true,
      line: true,
      ring: true,
      tint: true,
      label: true,
      ghost: true,
      badge: true,
      fade: true,
    };
    expect([...kinds].sort()).toEqual(Object.keys(all).sort());
  });
});
