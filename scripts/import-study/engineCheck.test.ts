import { describe, expect, it } from '@jest/globals';

import type { Evaluation } from '@/evaluation/evaluation';
import type { Lesson } from '@/lesson/lesson';
import { keyAfter, uci, uciLine } from '@/lesson/lesson.fixture';

import { at, testLesson } from './fixture';
import { engineCheck, fillBook } from './engineCheck';

/** Black's lesson: 1.d4 d5 (book) or 1...e5 (book, but loses a pawn), then 2.dxe5 Nc6 (book). */
const LESSON = testLesson({
  [keyAfter()]: at([{ uci: uci('d4') }]),
  [keyAfter('d4')]: at([
    {
      uci: uci('d4', 'd5'),
      book: true,
      notes: [
        {
          text: 'Black is winning here.',
          ideas: [{ type: 'evaluation', value: 'blackWinning' }],
        },
        { text: 'Black claims the centre.' },
      ],
    },
    { uci: uci('d4', 'e5'), book: true },
  ]),
  [keyAfter('d4', 'd5')]: at(
    [{ uci: uci('d4', 'd5', 'c4') }],
    [
      {
        text: 'Taking on c4 falls for a trap.',
        ideas: [
          {
            type: 'trap',
            moves: uciLine('d4', 'd5', 'c4', 'dxc4').slice(3),
            verdict: 'whiteClearly',
          },
        ],
      },
    ],
  ),
  [keyAfter('d4', 'e5')]: at([{ uci: uci('d4', 'e5', 'dxe5') }]),
  [keyAfter('d4', 'e5', 'dxe5')]: at([{ uci: uci('d4', 'e5', 'dxe5', 'Nc6'), book: true }]),
});

/** About even everywhere but after 1...e5, where White is a pawn and a half up. */
const evaluate = async (_line: readonly string[], key: string): Promise<Evaluation> =>
  key === keyAfter('d4', 'e5') || key === keyAfter('d4', 'e5', 'dxe5')
    ? { score: 0.64, pawns: 1.5 }
    : { score: 0.52, pawns: 0.2 };

describe('engineCheck', () => {
  it('unbooks a move the engine calls a mistake, and the book moves only it reached', async () => {
    const { lesson, report } = await engineCheck(LESSON, evaluate);
    const moves = lesson.positions[keyAfter('d4')].moves;
    expect(moves.map(({ uci, book }) => [uci, book])).toEqual([
      ['d7d5', true],
      ['e7e5', undefined],
    ]);
    expect(lesson.positions[keyAfter('d4', 'e5', 'dxe5')].moves[0].book).toBeUndefined();
    expect(report.unbooked).toEqual([{ line: '1.d4', move: 'e5', quality: 'mistake' }]);
    expect(report.unreachable).toEqual([{ line: '1.d4 e5 2.dxe5', move: 'Nc6' }]);
  });

  it("picks again among the guide's other moves where it overruled one, instead of ending the line", async () => {
    const others = {
      ...LESSON,
      positions: {
        ...LESSON.positions,
        // 1...c5 is listed beside the overruled 1...e5: it is picked instead of the line ending.
        [keyAfter('d4')]: at([{ uci: uci('d4', 'e5'), book: true }, { uci: uci('d4', 'c5') }]),
      },
    };
    delete others.positions[keyAfter('d4', 'd5')];
    const { lesson, report } = await engineCheck(others, evaluate);
    expect(report.cut).toEqual([]);
    expect(report.refilled).toEqual([
      { line: '1.d4', move: 'c5', why: "Stockfish's best of the guide's moves" },
    ]);
    expect(lesson.positions[keyAfter('d4')].moves.find(({ book }) => book)?.uci).toBe(
      uci('d4', 'c5'),
    );
  });

  it('cuts a lone overruled move below another one', async () => {
    // 1...e5 and then 2...Nc6 are each the guide's only move, and both lose.
    const nested = {
      ...LESSON,
      positions: {
        [keyAfter()]: LESSON.positions[keyAfter()],
        [keyAfter('d4')]: at([{ uci: uci('d4', 'e5'), book: true }]),
        [keyAfter('d4', 'e5')]: LESSON.positions[keyAfter('d4', 'e5')],
        [keyAfter('d4', 'e5', 'dxe5')]: at([{ uci: uci('d4', 'e5', 'dxe5', 'Nc6'), book: true }]),
      },
    };
    const losing = async (_line: readonly string[], key: string): Promise<Evaluation> =>
      key === keyAfter() || key === keyAfter('d4') || key === keyAfter('d4', 'e5', 'dxe5')
        ? { score: 0.52, pawns: 0.2 }
        : { score: 0.8, pawns: 4 };
    const { lesson, report } = await engineCheck(nested, losing);
    expect(Object.keys(lesson.positions)).toEqual([keyAfter()]);
    expect(report.unbooked.map(({ move }) => move)).toEqual(['e5', 'Nc6']);
    expect(report.cut).toEqual([{ line: '1.d4', moves: ['e5'], positions: 3 }]);
  });

  it('drops a note whose verdict the engine contradicts, and a trap whose bait is no error', async () => {
    const { lesson, report } = await engineCheck(LESSON, evaluate);
    expect(lesson.positions[keyAfter('d4')].moves[0].notes).toEqual([
      { text: 'Black claims the centre.' },
    ]);
    expect(lesson.positions[keyAfter('d4', 'd5')].notes).toBeUndefined();
    expect(report.dropped).toEqual([
      {
        line: '1.d4 d5',
        text: 'Black is winning here.',
        reason: 'says blackWinning, engine +0.20',
      },
      {
        line: '1.d4 d5',
        text: 'Taking on c4 falls for a trap.',
        reason: 'trap ends whiteClearly, engine +0.20',
      },
    ]);
  });

  it('reads a checkmate as won by the side that mated', async () => {
    // Checkmated, the engine answers mate 0: Black has won the position after 1...d5 here.
    const mated = async (): Promise<Evaluation> => ({ score: 0, pawns: 0, mate: 0 });
    const { lesson } = await engineCheck(LESSON, mated);
    expect(lesson.positions[keyAfter('d4')].moves[0].notes?.[0].text).toBe(
      'Black is winning here.',
    );
  });

  it('keeps a lesson the engine agrees with as it is', async () => {
    const even = async (): Promise<Evaluation> => ({ score: 0.52, pawns: 0.2 });
    const agreed = {
      ...LESSON,
      positions: {
        [keyAfter()]: LESSON.positions[keyAfter()],
        [keyAfter('d4')]: at([{ uci: uci('d4', 'd5'), book: true }]),
        [keyAfter('d4', 'd5')]: at([{ uci: uci('d4', 'd5', 'c4') }]),
      },
    };
    const { lesson, report } = await engineCheck(agreed, even);
    expect(lesson).toEqual(agreed);
    expect(report).toEqual({ unbooked: [], unreachable: [], cut: [], dropped: [], refilled: [] });
  });
});

describe('fillBook', () => {
  /** `LESSON` with no book moves at all. */
  const unbooked: Lesson = {
    ...LESSON,
    positions: Object.fromEntries(
      Object.entries(LESSON.positions).map(([key, position]) => [
        key,
        { ...position, moves: position.moves.map(({ book: _book, ...move }) => move) },
      ]),
    ),
  };
  const books = (lesson: Lesson, ...sans: string[]) =>
    lesson.positions[keyAfter(...sans)].moves.map(({ uci, book }) => [uci, book]);

  it("books Stockfish's best of the guide's moves, then the guide's only move past it", async () => {
    const { lesson, report } = await fillBook(unbooked, evaluate);
    expect(books(lesson, 'd4')).toEqual([
      ['d7d5', true],
      ['e7e5', undefined],
    ]);
    // 1...e5 is no book move, so nothing past it is filled.
    expect(books(lesson, 'd4', 'e5', 'dxe5')).toEqual([['b8c6', undefined]]);
    expect(report.filled).toEqual([
      { line: '1.d4', move: 'd5', why: "Stockfish's best of the guide's moves" },
    ]);
  });

  it('books the move whose note calls it the main line, though the guide lists it later', async () => {
    const lesson = {
      ...unbooked,
      positions: {
        ...unbooked.positions,
        [keyAfter('d4')]: at([
          // It starts like a main-line note, but names another move.
          { uci: uci('d4', 'd5'), notes: [{ text: 'The main line is 2.c4, a gambit.' }] },
          { uci: uci('d4', 'Nf6'), notes: [{ text: 'This is the main line.' }] },
        ]),
      },
    };
    const even = async (): Promise<Evaluation> => ({ score: 0.52, pawns: 0.2 });
    const filled = await fillBook(lesson, even);
    expect(books(filled.lesson, 'd4')).toEqual([
      ['g8f6', true],
      ['d7d5', undefined],
    ]);
    expect(filled.report.filled).toEqual([
      { line: '1.d4', move: 'Nf6', why: 'called the main line' },
    ]);
  });

  it("books Stockfish's own move where it overrules every move the guide shows, keeping them", async () => {
    const warned = { uci: uci('d4', 'e5'), notes: [{ text: 'e5 just loses a pawn.' }] };
    const lesson = {
      ...unbooked,
      positions: { ...unbooked.positions, [keyAfter('d4')]: at([warned]) },
    };
    delete lesson.positions[keyAfter('d4', 'd5')];
    const naming = async (line: readonly string[], key: string) => ({
      ...(await evaluate(line, key)),
      best: uci('d4', 'd5'),
    });
    const filled = await fillBook(lesson, naming);
    expect(filled.lesson.positions[keyAfter('d4')].moves).toEqual([
      { uci: uci('d4', 'd5'), book: true },
      warned,
    ]);
    expect(filled.report).toEqual({
      filled: [
        {
          line: '1.d4',
          move: 'd5',
          why: "Stockfish's best: the engine overruled every guide move",
        },
      ],
      ended: [],
    });
  });

  it('ends the line where the engine overrules every move the guide shows and names none', async () => {
    const lesson = {
      ...unbooked,
      positions: { ...unbooked.positions, [keyAfter('d4')]: at([{ uci: uci('d4', 'e5') }]) },
    };
    delete lesson.positions[keyAfter('d4', 'd5')];
    const filled = await fillBook(lesson, evaluate);
    expect(Object.keys(filled.lesson.positions)).toEqual([keyAfter()]);
    expect(filled.report).toEqual({
      filled: [],
      ended: [{ line: '1.d4', moves: ['e5'], positions: 3 }],
    });
  });
});
