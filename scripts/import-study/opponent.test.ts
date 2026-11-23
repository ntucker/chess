import { describe, expect, it } from '@jest/globals';
import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';

import { positionKey } from '@/game/replay';
import type { Lesson, Uci } from '@/lesson/lesson';

import { nextLearnerMove, pgnOf, walk } from './opponent';

const keyOf = (fen: string) => positionKey(Chess.fromSetup(parseFen(fen).unwrap()).unwrap());

// White books 1.e4, and 2.Nf3 against the Sicilian only.
const learner = {
  side: 'white',
  positions: {
    [keyOf('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')]: {
      moves: [{ uci: 'e2e4', book: true }],
    },
    [keyOf('rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2')]: {
      moves: [{ uci: 'g1f3', book: true }],
    },
  },
} as unknown as Lesson;

const opponent = async (): Promise<readonly Uci[]> => ['e7e5', 'c7c5'];

describe('the opponent walk', () => {
  it('numbers the learner’s next move from any ply', () => {
    expect([0, 1, 2, 3].map((ply) => nextLearnerMove('white', ply))).toEqual([1, 2, 2, 3]);
    expect([0, 1, 2, 3].map((ply) => nextLearnerMove('black', ply))).toEqual([1, 1, 2, 2]);
  });

  it('fills the learner’s gaps and stops after their last move', async () => {
    const asked: string[][] = [];
    const { tree, learnerTurns, open } = await walk([], {
      learner,
      moves: 2,
      opponent,
      answer: async (steps) => {
        asked.push(...steps.map(({ line }) => [...line]));
        return steps.map(() => 'g1f3');
      },
    });
    expect(asked).toEqual([['e4', 'e5']]);
    expect(learnerTurns).toBe(3);
    expect(open).toEqual([]);
    expect(pgnOf(tree, { Event: 'test' })).toBe(
      '[Event "test"]\n[Result "*"]\n\n1. e4 e5 ( 1... c5 2. Nf3 ) 2. Nf3 *\n',
    );
  });

  it('lists the gaps it is not given a move for', async () => {
    const { open } = await walk(['e4'], {
      learner,
      moves: 2,
      opponent,
      answer: async (steps) => steps.map(() => undefined),
    });
    expect(open.map(({ line }) => line.join(' '))).toEqual(['e4 e5']);
  });
});
