import { describe, expect, it } from '@jest/globals';
import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';

import { checkIdea, checkLesson, generatedIdeaProblem, trapProblem } from './check';
import { parsePositionKey, positionKey } from '@/game/replay';

import {
  type Idea,
  type Lesson,
  LESSON_FORMAT,
  type Mistake,
  type Note,
  type Purpose,
} from './lesson';
import { keyAfter, SAMPLE, uci } from './lesson.fixture';

/** The position after `sans`, played from the start. */
const after = (sans: string[]) => parsePositionKey(keyAfter(...sans))!;

function fen(text: string): Chess {
  return Chess.fromSetup(parseFen(text).unwrap()).unwrap();
}

const ADVANCE = ['e4', 'c6', 'd4', 'd5', 'e5', 'c5'];
const AT = {
  e5: after(ADVANCE.slice(0, 5)),
  dxc5: after([...ADVANCE, 'dxc5']),
  Bg4: after([...ADVANCE, 'dxc5', 'Nc6', 'Nf3', 'Bg4']),
  Bb5: after([...ADVANCE, 'dxc5', 'Nc6', 'Nf3', 'Bg4', 'Bb5']),
  Qa5: after([...ADVANCE, 'dxc5', 'Nc6', 'Nf3', 'Bg4', 'Bb5', 'Qa5+']),
  c3: after([...ADVANCE, 'dxc5', 'Nc6', 'Nf3', 'Bg4', 'c3']),
  Qa4: after([
    ...ADVANCE,
    'dxc5',
    'Nc6',
    'Nf3',
    'Bg4',
    'c3',
    'a6',
    'Qb3',
    'Qd7',
    'Nd4',
    'e6',
    'Qa4',
  ]),
  isolated: fen('4k3/pp3ppp/8/3p4/8/8/PP3PPP/4K3 w - - 0 1'),
  doubled: fen('4k3/pp3p1p/5p2/8/8/8/PP3PPP/4K3 w - - 0 1'),
  battery: fen('3rk3/3r4/8/3p4/4P3/2N5/8/3QK3 w - - 0 1'),
  bishops: fen('2b1k3/8/8/8/8/8/8/2B1KB2 w - - 0 1'),
  rookTrade: fen('r5k1/8/8/8/8/8/8/R3K3 b - - 0 1'),
  behindPawn: fen('4k3/8/8/8/8/3p4/4P3/4K3 w - - 0 1'),
  enPassant: fen('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1'),
  backward: fen('4k3/8/3p4/2p1p3/2P1P3/8/8/4K3 w - - 0 1'),
  majority: fen('4k3/pp6/8/8/8/8/PPP5/4K3 w - - 0 1'),
  nothingBehind: fen('4k3/8/8/8/n6q/8/8/R3K3 w - - 0 1'),
  breakInCheck: fen('4k3/8/8/3p4/2P1K3/8/8/8 w - - 0 1'),
};

const purpose = (
  from: Purpose['from'],
  relation: Purpose['relation'],
  ...targets: Purpose['targets']
): Idea => ({
  type: 'purpose',
  from,
  relation,
  targets,
});

// Ported from the trial's validate.py self-test, plus the version 2 types.
const CASES: [name: string, at: Chess, idea: Idea, holds: boolean][] = [
  ['queen attacks bishop', AT.Qa5, purpose('a5', 'attacks', 'b5'), true],
  ['queen gives check', AT.Qa5, purpose('a5', 'checks', 'e1'), true],
  ['queen x-ray through b5 is not an attack', AT.Qa5, purpose('a5', 'attacks', 'c5'), false],
  ['queen aims at c5 through the bishop on b5', AT.Qa5, purpose('a5', 'aims', 'c5'), true],
  [
    'queen attacks e1 directly, so it does not aim at it',
    AT.Qa5,
    purpose('a5', 'aims', 'e1'),
    false,
  ],
  ['empty from square', AT.Qa5, purpose('a4', 'attacks', 'b5'), false],
  ['absolute pin Bb5-c6-e8', AT.Bb5, purpose('b5', 'pins', 'c6'), true],
  ['relative pin Qa4-c6-d7', AT.Qa4, purpose('a4', 'pins', 'c6'), true],
  ['no pin on b7', AT.Qa4, purpose('a4', 'pins', 'b7'), false],
  ['no pin with nothing behind the target', AT.nothingBehind, purpose('a1', 'pins', 'a4'), false],
  ['knight on c6 defends the queen on d8', AT.Bg4, purpose('c6', 'defends', 'd8'), true],
  ['bishop aims at d1 through the f3 knight', AT.Bg4, purpose('g4', 'aims', 'd1'), true],
  ['bishop attacks f3, so it does not aim at it', AT.Bg4, purpose('g4', 'aims', 'f3'), false],
  ['the f3 knight blocks the bishop from d1', AT.Bg4, purpose('f3', 'blocks', 'd1'), true],
  ['e5 pawn controls d6', AT.e5, purpose('e5', 'controls', 'd6', 'f6'), true],
  [
    'plan Nc6 Bg4 Qa5',
    AT.dxc5,
    {
      type: 'plan',
      side: 'black',
      routes: [
        { from: 'b8', to: 'c6' },
        { from: 'c8', to: 'g4' },
        { from: 'd8', to: 'a5' },
      ],
    },
    true,
  ],
  [
    'plan Bxc5 blocked by own e7 pawn',
    AT.dxc5,
    { type: 'plan', side: 'black', routes: [{ from: 'f8', to: 'c5' }] },
    false,
  ],
  [
    'plan e6 then Bxc5 (the blocker moved earlier)',
    AT.dxc5,
    {
      type: 'plan',
      side: 'black',
      routes: [
        { from: 'e7', to: 'e6' },
        { from: 'f8', to: 'c5' },
      ],
    },
    true,
  ],
  [
    'plan Ng8-f5 in 2 moves',
    AT.dxc5,
    { type: 'plan', side: 'black', routes: [{ from: 'g8', to: 'f5', moves: 2 }] },
    true,
  ],
  [
    'plan Ng8-f5 in 1 move',
    AT.dxc5,
    { type: 'plan', side: 'black', routes: [{ from: 'g8', to: 'f5' }] },
    false,
  ],
  [
    'plan castles after e6 Be7 Nh6',
    AT.Bg4,
    {
      type: 'plan',
      side: 'black',
      routes: [
        { from: 'e7', to: 'e6' },
        { from: 'f8', to: 'e7' },
        { from: 'g8', to: 'h6' },
        { from: 'e8', to: 'g8' },
      ],
    },
    true,
  ],
  [
    'plan with a two-square pawn step',
    AT.dxc5,
    { type: 'plan', side: 'black', routes: [{ from: 'g7', to: 'g5' }] },
    true,
  ],
  [
    'plan with a two-square step through a piece',
    fen('4k3/4p3/4N3/8/8/8/8/4K3 b - - 0 1'),
    { type: 'plan', side: 'black', routes: [{ from: 'e7', to: 'e5' }] },
    false,
  ],
  [
    'plan with a white piece',
    AT.dxc5,
    { type: 'plan', side: 'black', routes: [{ from: 'e5', to: 'e6' }] },
    false,
  ],
  [
    'plan goal attacked from a route end',
    AT.dxc5,
    { type: 'plan', side: 'black', routes: [{ from: 'b8', to: 'c6' }], goals: ['e5'] },
    true,
  ],
  [
    'plan goal out of reach',
    AT.dxc5,
    { type: 'plan', side: 'black', routes: [{ from: 'b8', to: 'c6' }], goals: ['h5'] },
    false,
  ],
  [
    'plan goal attacked where a piece ends after two routes',
    AT.dxc5,
    {
      type: 'plan',
      side: 'black',
      routes: [
        { from: 'b8', to: 'c6' },
        { from: 'c6', to: 'e5' },
      ],
      goals: ['d3'],
    },
    true,
  ],
  [
    'plan goal attacked only from a square the piece left',
    AT.dxc5,
    {
      type: 'plan',
      side: 'black',
      routes: [
        { from: 'b8', to: 'c6' },
        { from: 'c6', to: 'e5' },
      ],
      goals: ['b4'],
    },
    false,
  ],
  [
    'threat Bxf3 by black, who is to move',
    AT.Bb5,
    { type: 'threat', side: 'black', move: 'g4f3' },
    true,
  ],
  [
    'threat Bxf3 by black after a pass',
    AT.Bg4,
    { type: 'threat', side: 'black', move: 'g4f3' },
    true,
  ],
  [
    'threat Qxd1 impossible (own d5 pawn blocks)',
    AT.Bg4,
    { type: 'threat', side: 'black', move: 'd8d1' },
    false,
  ],
  [
    'threat prevented by the side to move',
    AT.Bg4,
    { type: 'threat', side: 'black', move: 'g4f3', answer: 'b1d2' },
    true,
  ],
  [
    'threat answered after it is played',
    AT.rookTrade,
    { type: 'threat', side: 'black', move: 'a8a1', answer: 'e1d2' },
    true,
  ],
  [
    'answer by a piece the threat captures',
    AT.rookTrade,
    { type: 'threat', side: 'black', move: 'a8a1', answer: 'a1a2' },
    false,
  ],
  ['mistake a legal move', AT.c3, { type: 'mistake', move: 'c6e5' }, true],
  ['mistake an illegal move', AT.c3, { type: 'mistake', move: 'c6e4' }, false],
  [
    'line with both sides moves',
    AT.dxc5,
    { type: 'line', moves: ['e7e6', 'g1f3', 'f8c5'], verdict: 'equal' },
    true,
  ],
  [
    'line with an illegal move',
    AT.dxc5,
    { type: 'line', moves: ['e7e6', 'f8c5'], verdict: 'equal' },
    false,
  ],
  [
    'isolated d5',
    AT.isolated,
    { type: 'structure', side: 'black', features: [{ kind: 'isolatedPawn', squares: ['d5'] }] },
    true,
  ],
  [
    'a7 not isolated',
    AT.isolated,
    { type: 'structure', side: 'black', features: [{ kind: 'isolatedPawn', squares: ['a7'] }] },
    false,
  ],
  [
    'passed d5',
    AT.isolated,
    { type: 'structure', side: 'black', features: [{ kind: 'passedPawn', squares: ['d5'] }] },
    true,
  ],
  [
    'doubled f-pawns, open d-file',
    AT.doubled,
    {
      type: 'structure',
      side: 'black',
      features: [
        { kind: 'doubledPawns', files: ['f'] },
        { kind: 'openFile', files: ['d'] },
      ],
    },
    true,
  ],
  [
    'f-file not open',
    AT.doubled,
    { type: 'structure', side: 'black', features: [{ kind: 'openFile', files: ['f'] }] },
    false,
  ],
  [
    'chain d4-e5',
    AT.e5,
    { type: 'structure', side: 'white', features: [{ kind: 'pawnChain', squares: ['e5', 'd4'] }] },
    true,
  ],
  [
    'd4 and f2 are no chain',
    AT.e5,
    { type: 'structure', side: 'white', features: [{ kind: 'pawnChain', squares: ['d4', 'f2'] }] },
    false,
  ],
  [
    'f6 break hits e5',
    AT.e5,
    { type: 'structure', side: 'black', features: [{ kind: 'pawnBreak', move: 'f7f6' }] },
    true,
  ],
  [
    'h6 is no break',
    AT.e5,
    { type: 'structure', side: 'black', features: [{ kind: 'pawnBreak', move: 'h7h6' }] },
    false,
  ],
  [
    'a pawn diagonally behind is no contact',
    AT.behindPawn,
    { type: 'structure', side: 'white', features: [{ kind: 'pawnBreak', move: 'e2e4' }] },
    false,
  ],
  [
    'an en passant break',
    AT.enPassant,
    { type: 'structure', side: 'white', features: [{ kind: 'pawnBreak', move: 'e5d6' }] },
    true,
  ],
  [
    'a break that captures the checking pawn',
    AT.breakInCheck,
    { type: 'structure', side: 'white', features: [{ kind: 'pawnBreak', move: 'c4d5' }] },
    true,
  ],
  [
    'backward d6',
    AT.backward,
    { type: 'structure', side: 'black', features: [{ kind: 'backwardPawn', squares: ['d6'] }] },
    true,
  ],
  [
    'c5 is not backward',
    AT.backward,
    { type: 'structure', side: 'black', features: [{ kind: 'backwardPawn', squares: ['c5'] }] },
    false,
  ],
  [
    'outpost d5 for white',
    AT.backward,
    { type: 'structure', side: 'white', features: [{ kind: 'outpost', squares: ['d5'] }] },
    true,
  ],
  [
    'd5 is no outpost for black',
    AT.backward,
    { type: 'structure', side: 'black', features: [{ kind: 'outpost', squares: ['d5'] }] },
    false,
  ],
  [
    'queenside majority',
    AT.majority,
    {
      type: 'structure',
      side: 'white',
      features: [{ kind: 'pawnMajority', files: ['a', 'b', 'c'] }],
    },
    true,
  ],
  [
    'no black majority',
    AT.majority,
    {
      type: 'structure',
      side: 'black',
      features: [{ kind: 'pawnMajority', files: ['a', 'b', 'c'] }],
    },
    false,
  ],
  [
    'd6 is no hole for black yet',
    AT.e5,
    { type: 'structure', side: 'black', features: [{ kind: 'weakSquare', squares: ['d6'] }] },
    false,
  ],
  [
    'half-open d-file for white after dxc5',
    AT.dxc5,
    { type: 'structure', side: 'white', features: [{ kind: 'halfOpenFile', files: ['d'] }] },
    true,
  ],
  [
    'pressure needs every listed piece to bear on the target',
    AT.battery,
    { type: 'pressure', side: 'black', target: 'e4', attackers: ['d5', 'd7'], defenders: [] },
    false,
  ],
  [
    'pressure on d5, defended by a rook battery',
    AT.battery,
    {
      type: 'pressure',
      side: 'white',
      target: 'd5',
      attackers: ['e4', 'c3', 'd1'],
      defenders: ['d7', 'd8'],
    },
    true,
  ],
  [
    'pressure that misses a defender',
    AT.battery,
    {
      type: 'pressure',
      side: 'white',
      target: 'd5',
      attackers: ['e4', 'c3', 'd1'],
      defenders: ['d7'],
    },
    false,
  ],
  ['bishop pair', AT.bishops, { type: 'imbalance', side: 'white', kind: 'bishopPair' }, true],
  ['material', AT.bishops, { type: 'imbalance', side: 'white', kind: 'material' }, true],
  [
    'no bishop pair for black',
    AT.bishops,
    { type: 'imbalance', side: 'black', kind: 'bishopPair' },
    false,
  ],
  [
    'white has more space after e5',
    AT.e5,
    { type: 'imbalance', side: 'white', kind: 'space' },
    true,
  ],
  [
    'black has less space after e5',
    AT.e5,
    { type: 'imbalance', side: 'black', kind: 'space' },
    false,
  ],
  ['evaluation', AT.dxc5, { type: 'evaluation', value: 'whiteSlightly' }, true],
  [
    'evaluation outside the scale',
    AT.dxc5,
    { type: 'evaluation', value: 'unclear' } as unknown as Idea,
    false,
  ],
  [
    'unknown relation',
    AT.Qa5,
    { ...purpose('a5', 'attacks', 'b5'), relation: 'hits' } as unknown as Idea,
    false,
  ],
];

describe('checkIdea', () => {
  it.each(CASES)('%s', (_name, at, idea, holds) => {
    const problem = checkIdea(idea, at);
    if (holds) expect(problem).toBeUndefined();
    else expect(problem).toEqual(expect.any(String));
  });

  it("checks a move's idea in the position after the move", () => {
    // After 7.dxc5 the d4 pawn is gone.
    expect(checkIdea(purpose('d4', 'attacks', 'c5'), AT.dxc5)).toMatch('d4 is empty');
  });
});

describe('trapProblem', () => {
  const NXE5 = ['c6e5', 'f3e5', 'g4d1', 'f1b5', 'd8d7', 'b5d7', 'e8d8', 'e1d1'];

  it.each<[string, Chess, string[], Parameters<typeof trapProblem>[2], boolean]>([
    ['a trap that loses material', AT.c3, NXE5, 'losesMaterial', true],
    ['a one-move trap that shows no loss', AT.c3, NXE5.slice(0, 1), 'losesMaterial', false],
    ['a trap with an illegal move', AT.c3, ['c6e4'], 'whiteWinning', false],
    ['a trap a move earlier', AT.Bg4, ['d1d5'], 'blackWinning', true],
  ])('%s', (_name, at, moves, verdict, holds) => {
    const problem = trapProblem(at, moves, verdict);
    if (holds) expect(problem).toBeUndefined();
    else expect(problem).toEqual(expect.any(String));
  });
});

describe('checkLesson', () => {
  const start = Chess.default();
  const afterE4 = start.clone();
  afterE4.play(parseSan(afterE4, 'e4')!);
  const afterC6 = afterE4.clone();
  afterC6.play(parseSan(afterC6, 'c6')!);

  const lesson: Lesson = {
    format: LESSON_FORMAT,
    id: 'test',
    title: 'Test',
    side: 'black',
    start: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    sources: [{ title: 'Test study', author: 'Someone', url: 'https://lichess.org/study/test' }],
    popularity: { ratingBands: [1000, 1200], speeds: ['blitz'], date: '2026-11-18' },
    variations: { caro: { name: 'Caro-Kann' } },
    positions: {
      [positionKey(start)]: { variation: 'caro', moves: [{ uci: 'e2e4', games: [10, 20] }] },
      [positionKey(afterE4)]: {
        variation: 'caro',
        moves: [
          {
            uci: 'c7c6',
            book: true,
            risk: 'safe',
            notes: [{ text: 'You prepare d5.', ideas: [purpose('c6', 'controls', 'd5')] }],
          },
        ],
      },
      [positionKey(afterC6)]: {
        variation: 'caro',
        moves: [],
        notes: [{ text: 'White chooses a system.' }],
      },
    },
  };

  const withPosition = (key: string, entry: Lesson['positions'][string]): Lesson => ({
    ...lesson,
    positions: { ...lesson.positions, [key]: entry },
  });

  it('accepts a sound lesson', () => {
    expect(checkLesson(lesson)).toEqual([]);
  });

  it('reports illegal moves, wrong counts and false ideas with their path', () => {
    const key = positionKey(afterE4);
    const problems = checkLesson(
      withPosition(key, {
        variation: 'caro',
        games: [5, 2.5],
        moves: [
          {
            uci: 'c7c6',
            book: true,
            games: [1],
            notes: [{ text: 'Hits.', ideas: [purpose('c6', 'attacks', 'd5')] }],
          },
          { uci: 'c7c4' },
        ],
      }),
    );
    expect(problems.map((p) => p.path)).toEqual([
      `positions["${key}"].games`,
      `positions["${key}"].moves[0].games`,
      `positions["${key}"].moves[0].notes[0].ideas[0]`,
      `positions["${key}"].moves[1].uci`,
    ]);
  });

  it("refuses a learner's position inside the book without a book move", () => {
    const key = positionKey(afterE4);
    const entry = lesson.positions[key];
    const unbooked = entry.moves.map(({ book: _book, ...move }) => move);
    expect(checkLesson(withPosition(key, { ...entry, moves: unbooked }))).toEqual([
      { path: `positions["${key}"]`, message: 'is inside the book but has no book move' },
    ]);
  });

  describe('marked mistakes', () => {
    const afterD4 = afterC6.clone();
    afterD4.play(parseSan(afterD4, 'd4')!);
    type Move = Lesson['positions'][string]['moves'][number];
    /** The lesson going on 2.d4, where Black has `move` and then `others`, a book move by default. */
    const marking = (move: Move, more = {}, others: Move[] = [{ uci: 'e7e6', book: true }]) => ({
      ...withPosition(positionKey(afterC6), {
        ...lesson.positions[positionKey(afterC6)],
        moves: [{ uci: 'd2d4' }],
      }),
      ...more,
      positions: {
        ...withPosition(positionKey(afterC6), {
          ...lesson.positions[positionKey(afterC6)],
          moves: [{ uci: 'd2d4' }],
        }).positions,
        [positionKey(afterD4)]: { variation: 'caro', moves: [move, ...others] },
      },
    });
    const at = `positions["${positionKey(afterD4)}"].moves[0].mistake`;

    it("still needs a book move where the learner's only moves are marked mistakes", () => {
      const mark = { uci: 'g7g5', mistake: { verdict: 'whiteWinning' as const } };
      expect(checkLesson(marking(mark))).toEqual([]);
      expect(checkLesson(marking(mark, {}, []))).toEqual([
        {
          path: `positions["${positionKey(afterD4)}"]`,
          message: 'is inside the book but has no book move',
        },
      ]);
    });

    it("holds the reply of the opponent's mark to be a book move where a clean run reaches its cue", () => {
      const lesson = marking({ uci: 'd7d5', book: true }, {}, [{ uci: 'h7h6' }]);
      /** The lesson with the last of `sans` marked `mistake` after `others`, its cue offering `replies`. */
      const withMark = (
        sans: string[],
        replies: Move[],
        others: Move[] = [],
        mistake: Mistake = {},
      ) => ({
        ...lesson,
        positions: {
          ...lesson.positions,
          [keyAfter(...sans.slice(0, -1))]: {
            variation: 'caro',
            moves: [...others, { uci: uci(...sans), mistake }],
          },
          [keyAfter(...sans)]: { variation: 'caro', moves: replies },
        },
      });
      // White's 2.g4?, where Black books 2...d5 and the mark's line may store 2...e5.
      const withG4 = (line?: string[]) =>
        withMark(
          ['e4', 'c6', 'g4'],
          [{ uci: 'd7d5', book: true }, { uci: 'e7e5' }],
          [{ uci: 'd2d4' }],
          line && { line },
        );
      expect(checkLesson(withG4())).toEqual([]);
      expect(checkLesson(withG4(['e7e5']))).toEqual([
        {
          path: `positions["${keyAfter('e4', 'c6')}"].moves[1].mistake`,
          message: 'a clean run reaches its cue, so its reply e7e5 must be a book move',
        },
      ]);
      // A reply the guide lacks is reported once, on the mark's line.
      expect(checkLesson(withG4(['e7e6'])).map(({ path }) => path)).toEqual([
        `positions["${keyAfter('e4', 'c6')}"].moves[1].mistake.line[0]`,
      ]);
      // An illegal book move at the cue is reported, not thrown, whatever the mark holds.
      const replies = [{ uci: 'e7e8', book: true }, { uci: 'e7e5' }];
      const illegal = (mistake: Mistake) =>
        checkLesson(withMark(['e4', 'c6', 'g4'], replies, [{ uci: 'd2d4' }], mistake)).map(
          ({ path }) => path,
        );
      const atCue = `positions["${keyAfter('e4', 'c6', 'g4')}"].moves[0].uci`;
      const mark = `positions["${keyAfter('e4', 'c6')}"].moves[1].mistake`;
      expect(illegal({})).toEqual([atCue]);
      // The guide's line ends before the illegal e7e8, so 2.g4 alone loses no material.
      expect(illegal({ verdict: 'losesMaterial' })).toEqual([`${mark}.verdict`, atCue]);
      expect(illegal({ line: ['e7e5'] })).toEqual([atCue, mark]);
      // Past Black's non-book 2...h6, no clean run reaches 3.g4?'s cue, so 3...h5 needn't be booked.
      expect(checkLesson(withMark(['e4', 'c6', 'd4', 'h6', 'g4'], [{ uci: 'h6h5' }]))).toEqual([]);
    });

    it('refuses a mark on a book move, and numbers out of range', () => {
      const problems = checkLesson(
        marking({ uci: 'g7g5', book: true, mistake: { cost: 0.05, gain: [0.1], name: ' ' } }),
      );
      expect(problems.map(({ path }) => path)).toEqual([
        at,
        `${at}.cost`,
        `${at}.gain`,
        `${at}.name`,
      ]);
    });

    it("takes a study's trap at any cost Stockfish measures, but no find under a mistake", () => {
      const costProblems = (mistake: Mistake) =>
        checkLesson(marking({ uci: 'g7g5', mistake }))
          .map(({ path }) => path)
          .filter((path) => path.endsWith('.cost'));
      expect(costProblems({ cost: 0.05, verdict: 'whiteWinning' })).toEqual([]);
      expect(costProblems({ cost: -0.01, verdict: 'whiteWinning' })).toEqual([`${at}.cost`]);
      expect(costProblems({ cost: 0.05 })).toEqual([`${at}.cost`]);
    });

    it('stores a line only of guide moves, and only where the guide would play another', () => {
      const afterG5 = afterD4.clone();
      afterG5.play(parseSan(afterG5, 'g5')!);
      /** `marking` with White's 3.Bxg5 or 3.h4 after the marked 2...g5, which stores `line`. */
      const withLine = (line: string[]) => {
        const marked = marking({ uci: 'g7g5', mistake: { line } });
        return {
          ...marked,
          positions: {
            ...marked.positions,
            [positionKey(afterG5)]: {
              variation: 'caro',
              moves: [{ uci: 'c1g5' }, { uci: 'h2h4' }],
            },
          },
        };
      };
      expect(checkLesson(withLine(['h2h4']))).toEqual([]);
      expect(checkLesson(withLine(['c1g5']))).toEqual([
        { path: `${at}.line`, message: 'is the line the guide gives anyway, so it is left out' },
      ]);
      expect(checkLesson(withLine(['f2f4']))).toEqual([
        { path: `${at}.line[0]`, message: 'is not a guide move at its position' },
      ]);
    });

    it("holds a verdict of losing material to the mark's line", () => {
      expect(checkLesson(marking({ uci: 'g7g5', mistake: { verdict: 'losesMaterial' } }))).toEqual([
        { path: `${at}.verdict`, message: 'black does not lose material: balance goes 0 to 0' },
      ]);
    });

    it('refuses a note naming a move the guide does not mark as a mistake there', () => {
      const key = positionKey(afterC6);
      const named = withPosition(key, {
        ...lesson.positions[key],
        notes: [{ text: 'A trap.', ideas: [{ type: 'mistake', move: 'd2d4' }] }],
      });
      expect(checkLesson(named)).toEqual([
        {
          path: `positions["${key}"].notes[0].ideas[0]`,
          message: 'mistake: names a move the guide does not mark as a mistake here',
        },
      ]);
    });
  });

  it('requires a source, and the license of share-alike Wikibooks text', () => {
    const wikibooks = {
      title: 'Chess Opening Theory',
      author: 'Wikibooks contributors',
      url: 'https://en.wikibooks.org/wiki/Chess_Opening_Theory',
    };
    const license = {
      name: 'CC BY-SA 4.0',
      url: 'https://creativecommons.org/licenses/by-sa/4.0/',
    };
    expect(checkLesson({ ...lesson, sources: [] }).map((p) => p.path)).toEqual(['sources']);
    const [study] = lesson.sources;
    expect(
      checkLesson({
        ...lesson,
        sources: [
          { ...study, author: ' ' },
          { ...study, url: 'lichess.org/study/test' },
          {
            ...study,
            url: 'https://lichess.org/study/other',
            license: { name: 'CC BY 4.0', url: 'creativecommons' },
          },
          { ...study, url: 'mailto:someone@example.com' },
          study,
        ],
      }),
    ).toEqual([
      { path: 'sources[0]', message: 'needs a title and an author' },
      { path: 'sources[1].url', message: 'lichess.org/study/test is not a web address' },
      { path: 'sources[2].license', message: 'needs a name and a URL' },
      { path: 'sources[3].url', message: 'mailto:someone@example.com is not a web address' },
      { path: 'sources[4].url', message: `${study.url} is listed twice` },
    ]);
    expect(checkLesson({ ...lesson, sources: [...lesson.sources, wikibooks] })).toEqual([
      {
        path: 'sources[1].license',
        message: 'is required for en.wikibooks.org, whose text is share-alike',
      },
    ]);
    expect(
      checkLesson({ ...lesson, sources: [...lesson.sources, { ...wikibooks, license }] }),
    ).toEqual([]);
  });

  it('refuses book moves for the opponent and castling written as king takes rook', () => {
    const castlingFen = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
    const castling = Chess.fromSetup(parseFen(castlingFen).unwrap()).unwrap();
    const problems = checkLesson(
      withPosition(positionKey(start), { variation: 'caro', moves: [{ uci: 'e2e4', book: true }] }),
    );
    expect(problems).toContainEqual({
      path: `positions["${positionKey(start)}"].moves[0].book`,
      message: "only black's moves are book moves",
    });
    expect(
      checkLesson({
        ...lesson,
        start: castlingFen,
        positions: { [positionKey(castling)]: { variation: 'caro', moves: [{ uci: 'e1h1' }] } },
      }),
    ).toContainEqual(
      expect.objectContaining({
        message: "write castling e1h1 as the king's two-square move (e1g1)",
      }),
    );
  });

  it('refuses castling in a plan after an earlier route moved the rook', () => {
    const idea: Idea = {
      type: 'plan',
      side: 'white',
      routes: [
        { from: 'h1', to: 'h3' },
        { from: 'e1', to: 'g1' },
      ],
    };
    const corners = fen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    expect(checkIdea({ ...idea, routes: [idea.routes[1]] }, corners)).toBeUndefined();
    expect(checkIdea(idea, corners)).toMatch(/cannot reach g1/);
    const castleTwice: Idea = {
      type: 'plan',
      side: 'white',
      routes: [
        { from: 'e1', to: 'g1' },
        { from: 'g1', to: 'c1' },
      ],
    };
    expect(checkIdea(castleTwice, corners)).toMatch(/cannot reach c1/);
  });

  it('refuses positions that only reach each other', () => {
    const island = (sans: string[]) => positionKey(after(sans));
    const problems = checkLesson({
      ...lesson,
      positions: {
        ...lesson.positions,
        [island(['Nf3'])]: { variation: 'caro', moves: [{ uci: 'g8f6' }] },
        [island(['Nf3', 'Nf6'])]: { variation: 'caro', moves: [{ uci: 'f3g1' }] },
        [island(['Nf3', 'Nf6', 'Ng1'])]: { variation: 'caro', moves: [{ uci: 'f6g8' }] },
      },
    });
    expect(problems.map((p) => p.message)).toEqual([
      'is not reachable from start',
      'is not reachable from start',
      'is not reachable from start',
    ]);
  });

  it('refuses keys with move counters and variation cycles', () => {
    const problems = checkLesson({
      ...withPosition('8/8/8/8/8/8/8/K6k w - - 0 1', { variation: 'nowhere', moves: [] }),
      variations: { ...lesson.variations, loop: { name: 'Loop', parent: 'loop' } },
    });
    expect(problems.map((p) => p.message)).toEqual([
      'variations form a cycle',
      'names no position, in it or under it',
      'key is not a position key (FEN without move counters, see positionKey)',
    ]);
  });

  it('refuses a variation no position is in or under', () => {
    const variations = {
      ...lesson.variations,
      advance: { name: 'Advance Variation', parent: 'caro' },
      tal: { name: 'Advance Variation: Tal Variation', parent: 'advance' },
      empty: { name: 'Empty', parent: 'caro' },
    };
    // 1.e4 c6 is in 'tal', so 'advance' above it names a position too.
    const named = withPosition(positionKey(afterC6), {
      variation: 'tal',
      moves: [],
      notes: [{ text: 'White chooses a system.' }],
    });
    expect(checkLesson({ ...named, variations })).toEqual([
      { path: 'variations["empty"]', message: 'names no position, in it or under it' },
    ]);
  });

  /** The problems the checker finds in a lesson whose one position has a note reading `text`. */
  const noteProblems = (text: string) =>
    checkLesson(
      withPosition(positionKey(afterC6), { variation: 'caro', moves: [], notes: [{ text }] }),
    );
  const notePath = `positions["${positionKey(afterC6)}"].notes[0].text`;

  it('refuses an original on a generated note, which no guide wrote', () => {
    const lesson = withPosition(positionKey(afterC6), {
      variation: 'caro',
      moves: [],
      notes: [
        {
          text: 'Your pawn holds d5.',
          generated: true,
          model: 'claude-fable-5-2',
          original: 'c6 prepares d5',
        },
      ],
    });
    expect(checkLesson(lesson)).toEqual([
      {
        path: `positions["${positionKey(afterC6)}"].notes[0].original`,
        message: 'is on a generated note, which no guide wrote',
      },
    ]);
  });

  it('refuses a generated note no model is credited with, and a model it does not know', () => {
    const key = positionKey(afterC6);
    const notes = [
      { text: 'Your pawn holds d5.', generated: true },
      { text: 'Your pawn holds d5.', model: 'gpt-4' },
      { text: 'Your pawn holds d5.', model: 'claude-sonnet-5-5' },
      { text: 'Your pawn holds d5.', generated: true, model: '' },
    ] as Note[];
    expect(checkLesson(withPosition(key, { variation: 'caro', moves: [], notes }))).toEqual([
      {
        path: `positions["${key}"].notes[0].model`,
        message: 'is missing on a generated note, so the app could not credit it',
      },
      {
        path: `positions["${key}"].notes[1].model`,
        message: 'gpt-4 is not one of claude-sonnet-5-5, claude-opus-5-5, claude-fable-5-2',
      },
      {
        path: `positions["${key}"].notes[3].model`,
        message: 'is missing on a generated note, so the app could not credit it',
      },
    ]);
  });

  it('holds a generated note to the ideas a guide stands behind', () => {
    const lesson = withPosition(positionKey(afterC6), {
      variation: 'caro',
      moves: [],
      notes: [
        {
          text: 'Your pawn heads for d5.',
          generated: true,
          model: 'claude-fable-5-2',
          ideas: [{ type: 'evaluation', value: 'equal' }],
        },
      ],
    });
    expect(checkLesson(lesson)).toEqual([
      {
        path: `positions["${positionKey(afterC6)}"].notes[0].ideas[0]`,
        message: 'evaluation: is a type no generated note draws',
      },
    ]);
  });

  it('holds a generated note to threats that win something', () => {
    const threat = (move: string): Idea => ({ type: 'threat', side: 'black', move });
    const lesson = withPosition(positionKey(afterC6), {
      variation: 'caro',
      moves: [],
      notes: [
        {
          text: 'Your queen eyes a5.',
          generated: true,
          model: 'claude-fable-5-2',
          ideas: [threat('d8a5')],
        },
      ],
    });
    expect(checkLesson(lesson)).toEqual([
      {
        path: `positions["${positionKey(afterC6)}"].notes[0].ideas[0]`,
        message: 'threat: takes nothing and does not mate',
      },
    ]);
    // A guide may call it a threat all the same.
    const notes = [{ text: 'Your queen eyes a5.', ideas: [threat('d8a5')] }];
    expect(
      checkLesson(withPosition(positionKey(afterC6), { variation: 'caro', moves: [], notes })),
    ).toEqual([]);
  });

  it('refuses long notes', () => {
    const text = Array.from({ length: 21 }, () => 'word').join(' ');
    expect(noteProblems(text)).toEqual([{ path: notePath, message: 'has 21 words (most 20)' }]);
  });

  it.each([
    ['6...Nxe4? 7.Nxd4 Nc5 8.Bc4 Nbd7', 'writes a line of moves in notation'],
    ['Trap: 5.Nf3 Bg4 6.h3 Bxf3 and White is better.', 'writes a line of moves in notation'],
    ['...Bf5, ...e6 and ...c5', 'is only a list of moves'],
    ['...Bxf3, then play ...e6, ...dxe4 and ...Nf6', 'is only a list of moves'],
  ])('refuses a note written in notation: %s', (text, message) => {
    expect(noteProblems(text)).toEqual([{ path: notePath, message }]);
  });

  it.each([
    'This transposes into the Classical Defense, covered in chapter four.',
    'According to the study, Black cannot stop the mate.',
    'Save it with the heart button.',
    'This lesson has a companion video; watch it to follow the ideas.',
    'This is the Traxler Counterattack, covered in another study.',
    'The Traxler is covered in a different study.',
    'Other studies cover 4.Ng5 in depth.',
  ])('refuses a note pointing outside the lesson: %s', (text) => {
    expect(noteProblems(text)).toEqual([
      { path: notePath, message: 'points to the study it came from' },
    ]);
  });

  it.each([
    'This reaches a position you already know.',
    'Your study of the centre pays off: d5 is strong.',
    "You'll reach this position often; study it carefully.",
    'This is a blunder: after 7.Nxe5 Bxd1 8.Bb5+ White comes out ahead.',
    'Against Ng3, develop with e6 and Be7, castle, then play b6, Bb7 and break with c5.',
    'Avoid.',
  ])('passes a sentence, with or without moves in it: %s', (text) => {
    expect(noteProblems(text)).toEqual([]);
  });
});

it('passes the sample lesson the tests use', () => {
  expect(checkLesson(SAMPLE)).toEqual([]);
});

describe('generatedIdeaProblem', () => {
  const threat = (side: 'white' | 'black', move: string): Idea => ({ type: 'threat', side, move });
  const qgd = after(['d4', 'd5', 'c4', 'e6']);

  it('takes a threat to win an undefended pawn as real', () => {
    expect(generatedIdeaProblem(threat('black', 'd5c4'), qgd)).toBeUndefined();
  });

  it('refuses a threat that takes nothing and does not mate', () => {
    expect(generatedIdeaProblem(threat('black', 'f8b4'), qgd)).toBe(
      'takes nothing and does not mate',
    );
  });

  it('weighs an en passant capture as taking a pawn', () => {
    const pos = fen('rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3');
    expect(generatedIdeaProblem(threat('white', 'e5d6'), pos)).toBe(
      'takes a defended piece and wins nothing',
    );
  });

  it('refuses an idea type no generated note draws', () => {
    expect(generatedIdeaProblem({ type: 'evaluation', value: 'equal' }, qgd)).toBe(
      'is a type no generated note draws',
    );
  });
});
