import { describe, expect, it } from '@jest/globals';

import type { FinalAnalysis } from '@/evaluation/evaluation';
import { replay } from '@/game/replay';

import { compareMove } from './comparison';

/** A final analysis of lines (move, White's advantage in pawns), best first. */
const analysis = (...lines: [string, number][]): FinalAnalysis => ({
  lines: lines.map(([uci, pawns]) => ({ uci, evaluation: { score: 0.5 + pawns / 20, pawns } })),
  depth: 18,
  final: true,
});

const plies = replay(['e2e4', 'e7e5', 'g1f3']);

describe('compareMove', () => {
  it("lists Stockfish's other top moves beside the move played, as changes for the learner", () => {
    // White's 2.Nf3, for Black.
    const before = analysis(['b1c3', 0.4], ['g1f3', 0.3], ['f1c4', 0.1]);
    expect(compareMove(plies, [undefined, undefined, before], 3, 'black')).toEqual({
      played: {
        uci: 'g1f3',
        san: 'Nf3',
        change: { label: '+0.1', description: '0.1 pawns better for you' },
      },
      others: [
        { uci: 'b1c3', san: 'Nc3', change: { label: '0.0', description: 'No change' } },
        {
          uci: 'f1c4',
          san: 'Bc4',
          change: { label: '+0.3', description: '0.3 pawns better for you' },
        },
      ],
    });
  });

  it("measures a move Stockfish didn't list by the position it reached", () => {
    const before = analysis(['b1c3', 0.4], ['f1c4', 0.3], ['d2d4', 0.2]);
    const after = analysis(['b8c6', 0.6]);
    expect(compareMove(plies, [undefined, undefined, before, after], 3, 'white').played).toEqual({
      uci: 'g1f3',
      san: 'Nf3',
      // Never better than the list's last move (`judgement`): 0.2, not 0.6.
      change: { label: '−0.2', description: '0.2 pawns worse for you' },
    });
  });

  it('has no changes and no other moves until the search before the move is final', () => {
    const partial = { ...analysis(['b1c3', 0.4]), final: false };
    expect(compareMove(plies, [undefined, undefined, partial], 3, 'white')).toEqual({
      played: { uci: 'g1f3', san: 'Nf3', change: undefined },
      others: [],
    });
  });
});
