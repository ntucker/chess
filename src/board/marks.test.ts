import { describe, expect, it } from '@jest/globals';

import { toneColors } from '@/theme/drawingTones';
import { qualityLooks } from '@/theme/moveQuality';

import { boardMarks, toneBrushes } from './marks';

describe('boardMarks', () => {
  it('draws nothing for no drawings', () => {
    expect(boardMarks([], 'white')).toEqual({
      shapes: [],
      tints: new Map(),
      glows: new Map(),
      unfaded: undefined,
    });
  });

  it("draws arrows with chessground's brushes, dashed and numbered on request", () => {
    const { shapes } = boardMarks(
      [
        { kind: 'arrow', from: 'g1', to: 'f3', tone: 'main' },
        { kind: 'arrow', from: 'c8', to: 'f5', tone: 'plan', step: 2, dashed: true },
      ],
      'white',
    );
    expect(shapes).toEqual([
      { orig: 'g1', dest: 'f3', brush: 'main', label: undefined },
      { orig: 'c8', dest: 'f5', brush: 'plan-dashed', label: { text: '2' } },
    ]);
    expect(toneBrushes['plan-dashed'].color).toBe(toneColors.plan);
    expect(toneBrushes.plan.color).toBe(toneColors.plan);
  });

  it('rings a square with a circle, and ghosts a piece with a see-through one', () => {
    const { shapes } = boardMarks(
      [
        { kind: 'ring', square: 'e5', tone: 'target' },
        { kind: 'ghost', square: 'e2', piece: { role: 'pawn', color: 'white' } },
      ],
      'white',
    );
    expect(shapes).toEqual([
      { orig: 'e5', brush: 'target' },
      { orig: 'e2', piece: { role: 'pawn', color: 'white' } },
    ]);
  });

  it('lights pieces, the later drawing winning, and a badge lights its piece in its label color', () => {
    const { glows, shapes } = boardMarks(
      [
        { kind: 'glow', square: 'f3', tone: 'other' },
        { kind: 'badge', square: 'f3', quality: 'blunder' },
        { kind: 'glow', square: 'd4', tone: 'main' },
      ],
      'white',
    );
    expect(glows).toEqual(
      new Map([
        ['f3', qualityLooks.blunder.color],
        ['d4', toneColors.main],
      ]),
    );
    expect(shapes).toHaveLength(1);
    expect(shapes[0].customSvg?.html).toContain(qualityLooks.blunder.color);
  });

  it('tints squares by tone class, the later tint winning', () => {
    const { tints } = boardMarks(
      [
        { kind: 'tint', squares: ['c1', 'c2'], tone: 'plan' },
        { kind: 'tint', squares: ['c2'], tone: 'danger' },
      ],
      'white',
    );
    expect(tints).toEqual(
      new Map([
        ['c1', 'tint-plan'],
        ['c2', 'tint-danger'],
      ]),
    );
  });

  it('fades every piece but the ones kept, across fades', () => {
    const { unfaded } = boardMarks(
      [
        { kind: 'fade', except: ['d4', 'e5'] },
        { kind: 'fade', except: ['c6'] },
      ],
      'white',
    );
    expect(unfaded).toEqual(new Set(['d4', 'e5', 'c6']));
  });

  it('draws a line under the pieces from the first square through the rest, as the board is turned', () => {
    const chain = { kind: 'line', squares: ['b7', 'c6', 'd5'], tone: 'main' } as const;
    const [asWhite] = boardMarks([chain], 'white').shapes;
    const [asBlack] = boardMarks([chain], 'black').shapes;
    expect(asWhite.below).toBe(true);
    // One square right and down per step for White; left and up for Black.
    expect(asWhite.customSvg?.html).toContain('points="50,50 150,150 250,250"');
    expect(asBlack.customSvg?.html).toContain('points="50,50 -50,-50 -150,-150"');
    expect(boardMarks([{ ...chain, squares: ['b7'] }], 'white').shapes).toEqual([]);
  });

  it('labels a square with escaped text in its tone', () => {
    const [label] = boardMarks(
      [{ kind: 'label', square: 'd5', text: '3 v <2>', tone: 'target' }],
      'white',
    ).shapes;
    expect(label.orig).toBe('d5');
    expect(label.customSvg?.html).toContain('3 v &lt;2&gt;');
    expect(label.customSvg?.html).toContain(toneColors.target);
  });
});
