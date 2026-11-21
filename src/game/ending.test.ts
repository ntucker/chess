import { describe, expect, it } from '@jest/globals';

import { endingWords, gameEnding, resultVerdict } from '@/game/ending';
import { endingExamples } from '@/board/endingExamples';
import { lastPosition } from '@/game/replay';

const example = (title: string) => {
  const { line, learner } = endingExamples.find((each) => each.title === title)!;
  return gameEnding(lastPosition(line), learner);
};

describe('gameEnding', () => {
  it('is none while the game goes on', () => {
    expect(gameEnding(lastPosition(['e2e4']), 'white')).toBeUndefined();
  });

  it('is a win when the learner mates, and a loss when they are mated', () => {
    expect(example('Win')).toEqual({
      mood: 'won',
      reason: 'checkmate',
      kings: { learner: 'e1', rival: 'e8' },
      landed: 'f7',
    });
    expect(example('Loss')).toEqual({
      mood: 'lost',
      reason: 'checkmate',
      kings: { learner: 'e1', rival: 'e8' },
      landed: 'h4',
    });
  });

  it('is a draw with no winner', () => {
    expect(example('Draw')).toEqual({
      mood: 'drawn',
      reason: 'stalemate',
      kings: { learner: 'g6', rival: 'e1' },
      landed: 'e6',
    });
  });
});

describe('resultVerdict', () => {
  it('is a win for the side that mated, from either side', () => {
    expect(resultVerdict({ winner: 'black', reason: 'checkmate' }, 'black').mood).toBe('won');
    expect(resultVerdict({ winner: 'black', reason: 'checkmate' }, 'white').mood).toBe('lost');
    expect(resultVerdict({ winner: 'white', reason: 'checkmate' }, 'black').mood).toBe('lost');
  });

  it('is a draw with no winner', () => {
    expect(resultVerdict({ reason: 'stalemate' }, 'black').mood).toBe('drawn');
  });
});

describe('endingWords', () => {
  it('names the winner of a mate', () => {
    expect(endingWords({ mood: 'won', reason: 'checkmate' }, 'Maia')).toEqual({
      eyebrow: 'Checkmate',
      title: 'You win',
    });
    expect(endingWords({ mood: 'lost', reason: 'checkmate' }, 'Maia')).toEqual({
      eyebrow: 'Checkmate',
      title: 'Maia wins',
    });
  });

  it('names what drew the game', () => {
    expect(endingWords({ mood: 'drawn', reason: 'stalemate' }, 'Maia')).toEqual({
      eyebrow: 'Draw',
      title: 'Stalemate',
    });
    expect(endingWords({ mood: 'drawn', reason: 'threefold repetition' }, 'Maia').title).toBe(
      'Threefold repetition',
    );
  });
});
