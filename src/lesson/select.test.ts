import { describe, expect, it } from '@jest/globals';

import type { Lesson } from './lesson';
import { ADVANCE, keyAfter, MAIN, SAMPLE, uciLine, withMoves } from './lesson.fixture';
import {
  bookMoves,
  candidates,
  guideMove,
  guidePosition,
  lineKeys,
  lineVariation,
  opponentBand,
  variationPath,
} from './select';

const ucis = (lesson: Lesson, key: string, band: number | undefined) =>
  candidates(lesson, key, band).map(({ move }) => move.uci);

describe('guidePosition', () => {
  it('is inside the guide where the guide has moves', () => {
    expect(guidePosition(SAMPLE, keyAfter(...MAIN))).toMatchObject({ place: 'inside' });
  });

  it("is a guide line's end where the guide has notes but no moves", () => {
    const end = guidePosition(
      SAMPLE,
      keyAfter(...MAIN, 'e5', 'c5', 'dxc5', 'Nc6', 'Nf3', 'Bg4', 'Bb5', 'Qa5+'),
    );
    expect(end.place).toBe('end');
    expect(end.place !== 'beyond' && end.entry.notes).toHaveLength(1);
  });

  it('is beyond the guide where the lesson has no entry', () => {
    expect(guidePosition(SAMPLE, keyAfter('e4', 'e5'))).toEqual({ place: 'beyond' });
  });
});

describe('candidates', () => {
  const key = keyAfter(...MAIN);

  it('lists the most played in the band first', () => {
    // 1400 band: e5 960, exd5 820, Nc3 690, Nd2 280; 1000 band: exd5 620 leads.
    expect(ucis(SAMPLE, key, 2)).toEqual(['e4e5', 'e4d5', 'b1c3', 'b1d2']);
    expect(ucis(SAMPLE, key, 0)).toEqual(['e4d5', 'e4e5', 'b1c3', 'b1d2']);
  });

  it("gives each move its share of the band's games, and what its row shows", () => {
    const [advance] = candidates(SAMPLE, key, 2);
    expect(advance).toMatchObject({
      san: 'e5',
      from: 'e4',
      to: 'e5',
      piece: { role: 'pawn', color: 'white' },
      next: keyAfter(...MAIN, 'e5'),
      variation: 'advance',
    });
    expect(advance.share).toBeCloseTo(960 / (960 + 820 + 690 + 280));
  });

  it("keeps the file's order for ties and for moves without counts", () => {
    const tied = withMoves(SAMPLE, key, (moves) =>
      moves.map((move) => ({ ...move, games: [1, 1, 1, 1, 1] })),
    );
    expect(ucis(tied, key, 2)).toEqual(['e4e5', 'e4d5', 'b1c3', 'b1d2']);

    const partly = withMoves(SAMPLE, key, ([e5, ...rest]) => [
      { ...e5, games: undefined },
      ...rest,
    ]);
    expect(ucis(partly, key, 2)).toEqual(['e4d5', 'b1c3', 'b1d2', 'e4e5']);
    expect(candidates(partly, key, 2).at(-1)!.share).toBeUndefined();

    const none = withMoves(SAMPLE, key, (moves) =>
      moves.map((move) => ({ ...move, games: undefined })),
    );
    expect(ucis(none, key, 2)).toEqual(['e4e5', 'e4d5', 'b1c3', 'b1d2']);
    expect(candidates(none, key, 2).map(({ share }) => share)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });

  it("keeps the file's order without a band", () => {
    expect(ucis(SAMPLE, key, undefined)).toEqual(['e4e5', 'e4d5', 'b1c3', 'b1d2']);
  });

  it('names castling by its king move', () => {
    const [castles] = candidates(
      SAMPLE,
      keyAfter(...MAIN, 'e5', 'Bf5', 'Nf3', 'e6', 'Be2', 'c5'),
      2,
    );
    expect(castles).toMatchObject({ san: 'O-O', from: 'e1', to: 'g1', move: { uci: 'e1g1' } });
  });

  it('is empty at a guide end and beyond the guide', () => {
    expect(
      candidates(
        SAMPLE,
        keyAfter(...MAIN, 'e5', 'c5', 'dxc5', 'Nc6', 'Nf3', 'Bg4', 'Bb5', 'Qa5+'),
        2,
      ),
    ).toEqual([]);
    expect(candidates(SAMPLE, keyAfter('e4', 'e5'), 2)).toEqual([]);
  });

  it('leaves the variation out for a move that leads beyond the guide', () => {
    const beyond = withMoves(SAMPLE, key, (moves) => [...moves, { uci: 'f1c4' }]);
    expect(candidates(beyond, key, 2).at(-1)).toMatchObject({ san: 'Bc4', variation: undefined });
  });
});

describe('opponentBand', () => {
  it.each([
    [1100, 0],
    [1200, 1],
    [1300, 1],
    [1400, 2],
    [1500, 2],
    [1600, 3],
    [1700, 3],
    [1800, 4],
    [1900, 4],
    ['stockfish', 4],
  ] as const)('reads %s from band %i', (opponent, band) => {
    expect(opponentBand(SAMPLE, opponent)).toBe(band);
  });

  it('is undefined for a lesson without counts', () => {
    expect(opponentBand({ ...SAMPLE, popularity: undefined }, 1500)).toBeUndefined();
  });
});

describe('guideMove', () => {
  it('finds a move as the guide stores it, and nothing for other moves', () => {
    expect(guideMove(SAMPLE, keyAfter('e4'), 'c7c6')).toMatchObject({ uci: 'c7c6', book: true });
    expect(guideMove(SAMPLE, keyAfter('e4'), 'e7e5')).toBeUndefined();
    expect(guideMove(SAMPLE, keyAfter('e4', 'e5'), 'g1f3')).toBeUndefined();
  });
});

describe('bookMoves', () => {
  it("marks the learner's guide moves, not the opponent's or moves off the guide", () => {
    expect(bookMoves(SAMPLE, uciLine(...ADVANCE, 'a6'))).toEqual([
      false,
      true,
      false,
      true,
      false,
      false,
    ]);
  });
});

describe('variationPath', () => {
  it('lists the opening first', () => {
    const names = (id: string) => variationPath(SAMPLE, id).map(({ name }) => name);
    expect(names('short')).toEqual(['Caro-Kann Defence', 'Advance Variation', 'Short Variation']);
    expect(names('caro-kann')).toEqual(['Caro-Kann Defence']);
  });
});

describe('lineVariation', () => {
  const names = (sans: string[]) =>
    lineVariation(SAMPLE, lineKeys(uciLine(...sans))).map(({ name }) => name);

  it("is the last position's variation, or the last one passed beyond the guide", () => {
    expect(names(MAIN)).toEqual(['Caro-Kann Defence']);
    expect(names(ADVANCE)).toEqual(['Caro-Kann Defence', 'Advance Variation']);
    expect(names([...ADVANCE, 'a6', 'Nf3'])).toEqual(['Caro-Kann Defence', 'Advance Variation']);
  });
});

describe('lineKeys', () => {
  it('keys the start and the position after each move', () => {
    const keys = lineKeys(uciLine('e4', 'c6'));
    expect(keys).toHaveLength(3);
    expect(keys[2]).toBe(keyAfter('e4', 'c6'));
    expect(keys[0]).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -');
  });
});
