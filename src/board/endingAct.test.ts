import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { gameEnding } from '@/game/ending';
import { ACT_TIMES, cardBand, endingAct, KING_PARTS, MOVE_MS, TINTS } from '@/board/endingAct';
import { endingExamples } from '@/board/endingExamples';
import type { Square } from '@/board/drawing';
import { type Color, lastPosition } from '@/game/replay';

/** The act the endings page shows for the example called `title`. */
function exampleAct(title: string) {
  const example = endingExamples.find((each) => each.title === title)!;
  return endingAct(gameEnding(lastPosition(example.line), example.learner)!, example.learner);
}

describe('endingAct', () => {
  it('lights the learner who wins and casts the rival as the mated king', () => {
    const act = exampleAct('Win');
    expect(act.kings).toEqual([
      { square: 'e1', part: 'winner' },
      { square: 'e8', part: 'beaten' },
    ]);
    expect(act.spot).toEqual([4, 7]);
    expect(act.cut).toEqual([4, 0]);
    expect(act.sparks.length).toBeGreaterThan(0);
    expect(act.confetti.length).toBeGreaterThan(0);
  });

  it('leaves one light on the learner who is mated, and throws nothing', () => {
    const act = exampleAct('Loss');
    expect(act.kings.map(({ square, part }) => [square, part])).toEqual([
      ['e1', 'beaten'],
      ['e8', 'winner'],
    ]);
    expect(act.spot).toEqual([4, 7]);
    expect(act.cut).toEqual([4, 7]);
    expect(act.sparks).toEqual([]);
    expect(act.confetti).toEqual([]);
  });

  it('keeps both kings level in a draw, with no light on either', () => {
    const act = exampleAct('Draw');
    expect(act.kings).toEqual([
      { square: 'g6', part: 'level' },
      { square: 'e1', part: 'level' },
    ]);
    expect(act.spot).toBeUndefined();
    expect(act.cut).toBeUndefined();
    expect(act.confetti).toEqual([]);
  });

  it("lights the learner's king as they see it", () => {
    // Black sits at the bottom, so its king on g6 is second from the left, third rank from the bottom.
    const act = endingAct({ mood: 'won', kings: { learner: 'g6', rival: 'e1' } }, 'black');
    expect(act.spot).toEqual([1, 5]);
  });

  it('is the same on every showing', () => {
    expect(exampleAct('Win')).toEqual(exampleAct('Win'));
  });

  it('keeps sparks near their king and spreads confetti over the whole board', () => {
    const { sparks, confetti } = exampleAct('Win');
    for (const { to, tint } of sparks) {
      const reach = Math.hypot(...to);
      expect(reach).toBeGreaterThanOrEqual(1);
      expect(reach).toBeLessThanOrEqual(3.1);
      expect(TINTS).toContain(tint);
    }
    // No two sparks leave in the same direction.
    const eighths = new Set(
      sparks.map(({ to }) => Math.floor((Math.atan2(to[1], to[0]) / Math.PI) * 4)),
    );
    expect(eighths.size).toBe(8);
    // Each speck is in the middle of its square-wide box.
    const columns = new Set(confetti.map(({ x }) => Math.min(7, Math.floor(x + 0.5))));
    expect(columns.size).toBe(8);
    for (const { x } of confetti) {
      expect(x).toBeGreaterThanOrEqual(-0.5);
      expect(x).toBeLessThanOrEqual(7.5);
    }
  });
});

describe('ACT_TIMES', () => {
  it('waits for the last move to land, and lets the card read in the dark before the lights come up', () => {
    for (const times of Object.values(ACT_TIMES)) {
      expect(times.dim).toBeGreaterThanOrEqual(MOVE_MS);
      expect(times.card).toBeGreaterThan(times.dim);
      expect(times.up).toBeGreaterThan(times.card + 1500);
    }
  });

  it('gives a loss more time than a win', () => {
    expect(ACT_TIMES.lost.card).toBeGreaterThan(ACT_TIMES.won.card);
    const cutMs = ({ strike, crownOff }: (typeof ACT_TIMES)['won']) => crownOff - strike;
    expect(cutMs(ACT_TIMES.lost)).toBe(2 * cutMs(ACT_TIMES.won));
  });
});

describe('cardBand', () => {
  const band = (learner: Square, rival: Square, landed: Square, orientation: Color = 'white') =>
    cardBand({ kings: { learner, rival }, landed }, orientation);

  it('lies across the middle while the kings and the last move are elsewhere', () => {
    // All three bands are open, so the middle one wins.
    expect(band('e1', 'e8', 'h1')).toBe('middle');
  });

  it('moves off a king in the middle', () => {
    // The learner's king on e4 is in the middle two ranks; nothing is on the two above.
    expect(band('e4', 'h8', 'h1')).toBe('upper');
    // From Black's side, the rival's king on e5 is in the middle two ranks and the learner's on c2 in the two above them.
    expect(band('c2', 'e5', 'a8', 'black')).toBe('lower');
  });

  it('moves off the piece that mated, where the kings leave room', () => {
    // 1.f3 e5 2.g4 Qh4#: the queen on h4 is in the middle two ranks.
    expect(band('e1', 'e8', 'h4')).toBe('upper');
    // Kings on e5 and e2 leave only the upper band, so the card covers the rook on a7.
    expect(band('e5', 'e2', 'a7')).toBe('upper');
  });
});

describe('Board.css', () => {
  const css = readFileSync(join(__dirname, '../components/Board.css'), 'utf8');

  it('names every mood, king part and tint the act names', () => {
    for (const mood of Object.keys(ACT_TIMES)) expect(css).toContain(`.ending-${mood} `);
    for (const part of KING_PARTS) expect(css).toContain(`.ending-${part}`);
    for (const tint of TINTS) expect(css).toContain(`cg-ending .${tint} `);
  });

  it('times its animations only by beats that ACT_TIMES sets (the card times itself by the rest)', () => {
    const beats = new Set([...css.matchAll(/var\(--act-(\w+)\)/g)].map(([, beat]) => beat));
    expect(beats.size).toBeGreaterThan(0);
    for (const beat of beats) expect(Object.keys(ACT_TIMES.won)).toContain(beat);
  });
});
