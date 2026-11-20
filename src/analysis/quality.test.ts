import { describe, expect, it } from '@jest/globals';

import type { Evaluation } from '@/evaluation/evaluation';

import { classifyMove, judgedFromList } from './quality';

/** An evaluation where White's expected score is `score`. */
const at = (score: number, best?: string): Evaluation => ({ score, pawns: 0, best });

describe('classifyMove', () => {
  it("calls the engine's own move the best, even if the next search scores it a little lower", () => {
    expect(
      classifyMove({ before: at(0.55, 'e2e4'), after: at(0.53), uci: 'e2e4', mover: 'white' }),
    ).toBe('best');
  });

  it('labels other moves by the expected score they give away', () => {
    const white = (after: number) =>
      classifyMove({ before: at(0.6, 'e2e4'), after: at(after), uci: 'd2d4', mover: 'white' });
    expect(white(0.59)).toBe('good');
    expect(white(0.56)).toBe('good');
    expect(white(0.54)).toBe('inaccuracy');
    expect(white(0.51)).toBe('inaccuracy');
    expect(white(0.49)).toBe('mistake');
    expect(white(0.41)).toBe('mistake');
    expect(white(0.39)).toBe('blunder');
    expect(white(0)).toBe('blunder');
  });

  it("measures Black's loss from Black's side", () => {
    const black = (after: number) =>
      classifyMove({ before: at(0.4, 'e7e5'), after: at(after), uci: 'g7g5', mover: 'black' });
    expect(black(0.43)).toBe('good');
    expect(black(0.47)).toBe('inaccuracy');
    expect(black(0.85)).toBe('blunder');
  });

  it('calls a move that gives nothing away the best, whichever move the engine names', () => {
    const white = (after: number, best?: string) =>
      classifyMove({ before: at(0.5, best), after: at(after), uci: 'e2e4', mover: 'white' });
    expect(white(0.51)).toBe('best');
    expect(white(0.51, 'd2d4')).toBe('best');
    expect(white(0.49)).toBe('good');
    // Mate with another move than the engine's: the game is won either way.
    expect(classifyMove({ before: at(1, 'h4h7'), after: at(1), uci: 'h4h8', mover: 'white' })).toBe(
      'best',
    );
  });

  it('calls missing a mate a blunder', () => {
    expect(
      classifyMove({
        before: { score: 1, pawns: 0, mate: 1, best: 'h4h7' },
        after: at(0.7),
        uci: 'a2a3',
        mover: 'white',
      }),
    ).toBe('blunder');
  });
});

describe('judgedFromList', () => {
  const top = [
    { uci: 'c7c5', evaluation: { score: 0.4, pawns: -1.1 } },
    { uci: 'e7e5', evaluation: { score: 0.47, pawns: -0.3 } },
  ];

  it("judges a listed move against the list's first move", () => {
    expect(judgedFromList(top, 'e7e5', 'black')).toEqual({
      before: { score: 0.4, pawns: -1.1, best: 'c7c5' },
      after: { score: 0.47, pawns: -0.3 },
      uci: 'e7e5',
      mover: 'black',
    });
    expect(classifyMove(judgedFromList(top, 'c7c5', 'black')!)).toBe('best');
  });

  it('leaves a move the list skips to the evaluations', () => {
    expect(judgedFromList(top, 'a7a6', 'black')).toBeUndefined();
  });
});
