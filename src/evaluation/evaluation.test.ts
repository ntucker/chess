import { describe, expect, it } from '@jest/globals';

import { evaluationReading, moveChange, pawnsLabel } from './evaluation';

describe('pawnsLabel', () => {
  it('writes tenths below 10 pawns, whole pawns up to 99', () => {
    expect(pawnsLabel(0.04)).toBe('0.0');
    expect(pawnsLabel(-1.26)).toBe('1.3');
    expect(pawnsLabel(12.4)).toBe('12');
    expect(pawnsLabel(250)).toBe('99');
  });
});

describe('moveChange', () => {
  const even = { score: 0.5, pawns: 0.3 };
  it('signs the pawns a move gains or loses for the side, whoever plays it', () => {
    expect(moveChange(even, { score: 0.6, pawns: 1.1 }, 'white')).toEqual({
      label: '+0.8',
      description: '0.8 pawns better for you',
    });
    // The same move, for Black: worse by as much.
    expect(moveChange(even, { score: 0.6, pawns: 1.1 }, 'black')).toEqual({
      label: '\u22120.8',
      description: '0.8 pawns worse for you',
    });
    expect(moveChange(even, { score: 0.5, pawns: 0.27 }, 'black')).toEqual({
      label: '0.0',
      description: 'No change',
    });
  });

  it('names the mate a move leads to, plus when the side mates', () => {
    expect(moveChange(even, { score: 0, pawns: 0, mate: -2 }, 'black')).toEqual({
      label: '+M2',
      description: 'You mate in 2 moves',
    });
    expect(moveChange(even, { score: 1, pawns: 0, mate: 1 }, 'black')).toEqual({
      label: '\u2212M1',
      description: 'Your opponent mates in 1 move',
    });
  });

  it('names the mate a move ends, plus when the side was getting mated', () => {
    const whiteMates = { score: 1, pawns: 0, mate: 3 };
    expect(moveChange(whiteMates, { score: 0.9, pawns: 5.2 }, 'white')).toEqual({
      label: '\u2212M3',
      description: 'Ends your mate in 3 moves',
    });
    expect(moveChange(whiteMates, { score: 0.9, pawns: 5.2 }, 'black')).toEqual({
      label: '+M3',
      description: "Ends your opponent's mate in 3 moves",
    });
  });
});

describe('evaluationReading', () => {
  it('reads a lead, an even position and a mate as the bar shows them', () => {
    expect(evaluationReading({ score: 0.6, pawns: 1.24 })).toMatchObject({
      label: '1.2',
      leader: 'white',
      description: 'White is ahead by 1.2 pawns',
    });
    expect(evaluationReading({ score: 0.4, pawns: -0.8 })).toMatchObject({ leader: 'black' });
    expect(evaluationReading({ score: 0.5, pawns: -0.02 })).toMatchObject({
      label: '0.0',
      description: 'Even',
    });
    expect(evaluationReading({ score: 0, pawns: 0, mate: -1 })).toMatchObject({
      label: 'M1',
      leader: 'black',
      description: 'Black mates in 1 move',
    });
  });
});
