import { describe, expect, it } from '@jest/globals';
import { makeFen } from 'chessops/fen';

import { type Color, parsePosition, playLine, type Ply, replay } from '@/game/replay';
import { uciLine } from '@/lesson/lesson.fixture';

import { reviewRule } from './refine';
import { reviewMoves } from './review';
import { listing } from './review.fixture';

/** Every position of `line` played from `fen`, as `replay` lists a game's. */
const playFrom = (fen: string, line: readonly string[]): Ply[] =>
  Array.from(playLine(line, parsePosition(fen)), ({ pos, repetitions, move }) => ({
    fen: makeFen(pos.toSetup()),
    turn: pos.turn,
    move,
    repetitions,
  }));

/** A position's lines, as `listing` takes them; none for a position not searched. */
type Lines = Parameters<typeof listing>;

/** Each move's label in the review of `plies`, with `analyses` of its positions. */
const labels = (plies: readonly Ply[], analyses: readonly Lines[]) =>
  reviewMoves({
    plies,
    book: [],
    legal: plies.map(() => 20),
    analyses: analyses.map((lines) => (lines.length ? listing(...lines) : undefined)),
    failed: new Set(),
  }).map(({ quality }) => quality);

// The Greek gift: 1.Bxh7+ Kxh7 gives up a bishop for a pawn.
const greekGift = playFrom('r1bq1rk1/pppn1ppp/4p3/3pP3/1b1P4/2NB1N2/PPP2PPP/R1BQK2R w KQ - 0 1', [
  'd3h7',
  'g8h7',
]);

describe('Brilliant', () => {
  it("is Stockfish's top move giving up a piece, by a mover not already winning", () => {
    const at = (second: number) =>
      labels(greekGift, [
        [
          ['d3h7', 0.75],
          ['e1g1', second],
          ['c1d2', 0.5],
        ],
        [['g8h7', 0.75]],
        [],
      ])[0];
    expect(at(0.6)).toBe('brilliant');
    // With the second line winning too, the sacrifice only wins more.
    expect(at(0.92)).toBe('best');
  });

  it('is not a sacrifice that leaves the mover losing', () => {
    const [first] = labels(greekGift, [
      [
        ['d3h7', 0.25],
        ['e1g1', 0.24],
      ],
      [['g8h7', 0.25]],
      [],
    ]);
    expect(first).toBe('best');
  });
});

describe('Great', () => {
  const plies = replay(uciLine('e4', 'd5', 'exd5', 'Qxd5'));
  /** Lines where `uci` is the only good move, scoring `score` for `side`. */
  const onlyMove = (uci: string, score: number, side: Color = 'white'): Lines => {
    const white = (forSide: number) => (side === 'white' ? forSide : 1 - forSide);
    return [
      [uci, white(score)],
      [undefined, white(score - 0.15)],
      [undefined, white(score - 0.2)],
    ];
  };

  it('is the top move when the next best loses a lot', () => {
    expect(labels(plies, [onlyMove('e2e4', 0.6), [], [], [], []])[0]).toBe('great');
    // Without a third line, or with the second losing less, it stays best.
    expect(
      labels(plies, [
        [
          ['e2e4', 0.6],
          ['d2d4', 0.4],
        ],
        [],
        [],
        [],
        [],
      ])[0],
    ).toBe('best');
    expect(
      labels(plies, [
        [
          ['e2e4', 0.6],
          ['d2d4', 0.55],
          ['c2c4', 0.5],
        ],
        [],
        [],
        [],
        [],
      ])[0],
    ).toBe('best');
  });

  it('is never a recapture', () => {
    // 1...Bxd5 takes back the knight; it doesn't win material, as exd5 takes it back.
    const recapture = playFrom('4k3/1b6/8/3n4/4P3/2N5/8/4K3 w - - 0 1', ['c3d5', 'b7d5']);
    expect(labels(recapture, [[], onlyMove('b7d5', 0.5, 'black'), []])[1]).toBe('best');
  });

  it('is never a move out of check, or a queen promotion', () => {
    const check = playFrom('4k3/8/8/8/8/8/8/r3K3 w - - 0 1', ['e1e2']);
    expect(labels(check, [onlyMove('e1e2', 0.5), []])[0]).toBe('best');
    // b8=Q, though the rook takes the queen.
    const promotion = playFrom('r3k3/1P6/8/8/8/8/8/4K3 w - - 0 1', ['b7b8q']);
    expect(labels(promotion, [onlyMove('b7b8q', 0.5), []])[0]).toBe('best');
  });

  it('is never a capture that simply wins material, or a piece saved from capture', () => {
    // Rxd5 takes a free knight; Ne5-c4 saves the knight the pawn on d6 attacks.
    const free = playFrom('4k3/8/8/3n4/8/8/8/3RK3 w - - 0 1', ['d1d5']);
    expect(labels(free, [onlyMove('d1d5', 0.9), []])[0]).toBe('best');
    const saved = playFrom('4k3/8/3p4/4N3/8/8/8/4K3 w - - 0 1', ['e5c4']);
    expect(labels(saved, [onlyMove('e5c4', 0.6), []])[0]).toBe('best');
  });
});

describe('Miss', () => {
  // 3...Nd4 is a blunder that 4.Nxd4 punishes; White plays 4.c3 instead.
  const plies = replay(uciLine('e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nd4', 'c3'));
  const game = (played: number) =>
    labels(plies, [
      [],
      [],
      [],
      [],
      [],
      [
        ['g8f6', 0.52],
        ['f8c5', 0.5],
      ],
      [
        ['f3d4', 0.8],
        ['c2c3', played],
        ['b1c3', played - 0.02],
      ],
      [],
    ]);

  it("is a mistake after the opponent's that leaves the mover no worse than before it", () => {
    const labelled = game(0.6);
    expect(labelled[5]).toBe('blunder');
    expect(labelled[6]).toBe('miss');
  });

  it('stays a blunder when the mover ends worse off than before the opponent erred', () => {
    expect(game(0.5)[6]).toBe('blunder');
  });
});

describe('reviewRule', () => {
  it("words the review's labels, and the game's as qualityRule does", () => {
    expect(reviewRule('great')).toBe(
      "the only good move, as Stockfish's next best gave away 10% or more of the winning chances",
    );
    expect(reviewRule('mistake')).toBe('gave away 10% to 20% of the winning chances');
  });
});
