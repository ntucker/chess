import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { gameEnding } from '@/game/ending';
import { ACT_TIMES, cardBand, endingAct, KING_PARTS, MOVE_MS, TINTS } from '@/board/endingAct';
import { endingExamples } from '@/board/endingExamples';
import { lastPosition } from '@/game/replay';

/** The act the endings page shows for the example called `title`. */
function exampleAct(title: string) {
  const example = endingExamples.find((each) => each.title === title)!;
  return endingAct(gameEnding(lastPosition(example.line), example.learner)!, example.learner);
}

describe('endingAct', () => {
  it('lights the learner who wins and tips the mated king toward the middle', () => {
    const act = exampleAct('Win');
    expect(act.kings).toEqual([
      { square: 'e1', part: 'winner', at: [4, 7], lean: -1 },
      { square: 'e8', part: 'fallen', at: [4, 0], lean: -1 },
    ]);
    expect(act.spot).toEqual([4, 7]);
    expect(act.sparks.length).toBeGreaterThan(0);
    expect(act.confetti.length).toBeGreaterThan(0);
  });

  it('leaves one light on the learner who is mated, and throws nothing', () => {
    const act = exampleAct('Loss');
    expect(act.kings.map(({ square, part }) => [square, part])).toEqual([
      ['e1', 'fallen'],
      ['e8', 'winner'],
    ]);
    expect(act.spot).toEqual([4, 7]);
    expect(act.sparks).toEqual([]);
    expect(act.confetti).toEqual([]);
  });

  it('keeps both kings level in a draw, seen from the side of the learner', () => {
    const act = exampleAct('Draw');
    expect(act.kings.map(({ part }) => part)).toEqual(['level', 'level']);
    // Black sits at the bottom, so its king on g6 is second from the left, third rank from the bottom.
    expect(act.kings.find(({ square }) => square === 'g6')?.at).toEqual([1, 5]);
    expect(act.spot).toBeUndefined();
    expect(act.confetti).toEqual([]);
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
  it('waits for the last move to land, and puts the card away before the lights come up', () => {
    for (const times of Object.values(ACT_TIMES)) {
      expect(times.dim).toBeGreaterThanOrEqual(MOVE_MS);
      expect(times.card).toBeGreaterThan(times.dim);
      expect(times.cardOut).toBeGreaterThan(times.card + 1500);
      expect(times.up).toBeGreaterThanOrEqual(times.cardOut);
    }
  });

  it('gives a loss more time than a win', () => {
    expect(ACT_TIMES.lost.card).toBeGreaterThan(ACT_TIMES.won.card);
  });
});

describe('cardBand', () => {
  it('lies across the middle while the kings are elsewhere', () => {
    expect(cardBand({ learner: 'e1', rival: 'e8' }, 'white')).toBe('middle');
  });

  it('moves off a king in the middle', () => {
    // The learner's king on e4 is in the middle two ranks; nothing is on the two above.
    expect(cardBand({ learner: 'e4', rival: 'h8' }, 'white')).toBe('upper');
    // From Black's side, the rival's king on e5 is in the middle two ranks and the learner's on c2 in the two above them.
    expect(cardBand({ learner: 'c2', rival: 'e5' }, 'black')).toBe('lower');
  });
});

describe('Board.css', () => {
  const css = readFileSync(join(__dirname, '../components/Board.css'), 'utf8');

  it('draws every mood, king part and tint the act names', () => {
    for (const mood of Object.keys(ACT_TIMES)) expect(css).toContain(`.ending-${mood} `);
    for (const part of KING_PARTS) expect(css).toContain(`.ending-${part}`);
    for (const tint of TINTS) expect(css).toContain(`cg-ending .${tint} `);
  });

  it('times its animations only by beats that ACT_TIMES sets', () => {
    const beats = new Set([...css.matchAll(/var\(--act-(\w+)\)/g)].map(([, beat]) => beat));
    expect(beats.size).toBeGreaterThan(0);
    for (const beat of beats) expect(Object.keys(ACT_TIMES.won)).toContain(beat);
  });
});
