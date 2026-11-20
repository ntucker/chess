import { describe, expect, it } from '@jest/globals';
import { INITIAL_FEN } from 'chessops/fen';

import type { Evaluation } from '@/evaluation/evaluation';
import { LESSON_FORMAT, type Lesson, type LessonMove } from '@/lesson/lesson';
import { keyAfter, SAMPLE, uciLine } from '@/lesson/lesson.fixture';

import { engineCheck } from './engineCheck';

const at = (moves: LessonMove[], notes?: Lesson['positions'][string]['notes']) => ({
  variation: 'test',
  moves,
  ...(notes && { notes }),
});
const uci = (...sans: string[]) => uciLine(...sans).at(-1)!;

/** Black's lesson: 1.d4 d5 (book) or 1...e5 (book, but loses a pawn), then 2.dxe5 Nc6 (book). */
const LESSON: Lesson = {
  format: LESSON_FORMAT,
  id: 'test',
  title: 'Test',
  side: 'black',
  start: INITIAL_FEN,
  sources: SAMPLE.sources,
  variations: { test: { name: 'Test' } },
  positions: {
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
  },
};

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
    expect(report).toEqual({ unbooked: [], unreachable: [], dropped: [] });
  });
});
