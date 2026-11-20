import { describe, expect, it } from '@jest/globals';
import { makeFen } from 'chessops/fen';

import type { Evaluation } from '@/evaluation/evaluation';
import { parsePositionKey } from '@/game/replay';
import { keyAfter, uci } from '@/lesson/lesson.fixture';

import type { Answer, AnswerIdea } from '../convert/answer';
import type { Ask } from '../convert/claude';
import { at, testLesson } from '../fixture';
import { explainBookMoves } from '.';
import type { BookMove } from './items';
import { emptyThreat, explainedNote } from './notes';
import { REFUSED } from './prompt';
import { bareNote, unexplainedMoves } from './unexplained';

/**
 * Black's lesson: 1.d4 d5 (book, no note) or 1...Nf6 (book, explained), then
 * 2.c4 e6 (book, with only a verdict).
 */
const LESSON = testLesson({
  [keyAfter()]: at([{ uci: uci('d4') }]),
  [keyAfter('d4')]: at([
    { uci: uci('d4', 'd5'), book: true },
    { uci: uci('d4', 'Nf6'), book: true, notes: [{ text: 'Your knight stops e4 for now.' }] },
  ]),
  [keyAfter('d4', 'd5')]: at([{ uci: uci('d4', 'd5', 'c4') }]),
  [keyAfter('d4', 'Nf6')]: at([{ uci: uci('d4', 'Nf6', 'c4') }]),
  [keyAfter('d4', 'd5', 'c4')]: at([
    {
      uci: uci('d4', 'd5', 'c4', 'e6'),
      book: true,
      notes: [{ text: 'The position is equal.', ideas: [{ type: 'evaluation', value: 'equal' }] }],
    },
  ]),
});

const evaluate = async (): Promise<Evaluation> => ({ score: 0.52, pawns: 0.2 });

const after = (...sans: string[]) => parsePositionKey(keyAfter(...sans))!;
const fen = (...sans: string[]) => makeFen(after(...sans).toSetup());
/** The last of `sans` as the book move the model explains, with Stockfish's `reply`. */
const bookMove = (sans: string[], reply?: string) => ({
  fenBefore: fen(...sans.slice(0, -1)),
  fenAfter: fen(...sans),
  engine: { forYou: '0.0', ...(reply && { reply }) },
});

const answer = (text: string, ideas: AnswerIdea[] = []): Answer => ({
  id: 'x',
  notes: [{ about: 'move', text, ideas }],
});

const CONTROLS: AnswerIdea = {
  type: 'purpose',
  from: 'd5',
  relation: 'controls',
  targets: ['c4', 'e4'],
};

describe('unexplainedMoves', () => {
  it('finds book moves with no note, or only a verdict, and skips explained ones', () => {
    expect(unexplainedMoves(LESSON).map(({ uci, why }) => [uci, why])).toEqual([
      ['d7d5', 'none'],
      ['e7e6', 'verdict'],
    ]);
  });

  it('counts a cut or two-word note as saying nothing, and a drawn one as explaining', () => {
    expect(bareNote({ text: 'Your pawn grabs the centre and…' })).toBe('fragment');
    expect(bareNote({ text: 'Solid move.' })).toBe('fragment');
    expect(
      bareNote({
        text: 'You are fine.',
        ideas: [{ type: 'purpose', from: 'd5', relation: 'controls', targets: ['e4'] }],
      }),
    ).toBeUndefined();
  });
});

describe('explainedNote', () => {
  it('keeps a true note, marked generated', () => {
    expect(
      explainedNote(answer('Your pawn takes the centre.', [CONTROLS]), bookMove(['d4', 'd5'])),
    ).toEqual({
      note: {
        text: 'Your pawn takes the centre.',
        generated: true,
        ideas: [{ type: 'purpose', from: 'd5', relation: 'controls', targets: ['c4', 'e4'] }],
      },
    });
  });

  it.each([
    ['a verdict', answer('You are slightly better after this.'), 'it says who is better'],
    ['notation', answer('Play e6 Nf6 Be7 O-O next.'), 'notation'],
    [
      'an evaluation',
      answer('Your pawn takes the centre.', [{ type: 'evaluation', value: 'equal' }]),
      'never does',
    ],
    [
      'a false drawing',
      answer('Your pawn hits the c4 pawn.', [{ ...CONTROLS, relation: 'attacks' }]),
      'false here',
    ],
  ])('refuses %s', (_, written, why) => {
    const result = explainedNote(written, bookMove(['d4', 'd5']));
    expect('refused' in result && result.refused.why).toContain(why);
  });

  it('answers none when the model gives no note', () => {
    expect(explainedNote({ id: 'x', notes: [] }, bookMove(['d4', 'd5']))).toEqual({ none: true });
  });

  it('refuses a win of material that Stockfish’s reply takes back', () => {
    const grab = answer('You win the e4 pawn for nothing.');
    const result = explainedNote(grab, bookMove(['e4', 'Nf6', 'Nc3', 'Nxe4'], 'Nxe4'));
    expect('refused' in result && result.refused.why).toContain('you win material');
    expect(explainedNote(grab, bookMove(['e4', 'Nf6', 'Nc3', 'Nxe4'], 'd3'))).toHaveProperty(
      'note',
    );
  });

  it('refuses a material lead the position after Stockfish’s reply does not have', () => {
    const ahead = answer('Your knight takes, leaving you a pawn up.');
    const result = explainedNote(ahead, bookMove(['e4', 'Nf6', 'Nc3', 'Nxe4'], 'Nxe4'));
    expect('refused' in result && result.refused.why).toContain('ahead on material');
    expect(explainedNote(ahead, bookMove(['e4', 'Nf6', 'Nc3', 'Nxe4'], 'd3'))).toHaveProperty(
      'note',
    );
  });
});

describe('emptyThreat', () => {
  const pos = after('d4', 'd5', 'c4', 'e6');
  it('takes a threat to win an undefended pawn as real', () => {
    expect(emptyThreat({ type: 'threat', side: 'black', move: 'd5c4' }, pos)).toBeUndefined();
  });

  it('refuses a threat that takes nothing and does not mate', () => {
    expect(emptyThreat({ type: 'threat', side: 'black', move: 'f8b4' }, pos)).toBe(
      'takes nothing and does not mate',
    );
  });
});

describe('explainBookMoves', () => {
  it('writes a generated note first on each move it explains, asking again once after a refusal', async () => {
    const calls: { items: readonly BookMove[]; addendum?: string }[] = [];
    const ask: Ask<BookMove> = async (_model, items, addendum) => {
      calls.push({ items, addendum });
      return new Map(
        items.map((item) => {
          const refusedBefore = item.refused !== undefined;
          const written =
            item.move === 'd5'
              ? answer('Your pawn takes the centre.', [CONTROLS])
              : refusedBefore
                ? answer('Your pawn backs up d5 and opens your bishop.')
                : answer('Black is better here.');
          return [item.id, { ...written, id: item.id }];
        }),
      );
    };
    const { lesson, report } = await explainBookMoves(LESSON, ask, evaluate);
    expect(calls.map(({ items, addendum }) => [items.map(({ move }) => move), addendum])).toEqual([
      [['d5', 'e6'], undefined],
      [['e6'], REFUSED],
    ]);
    expect(calls[1].items[0].refused).toEqual([
      { text: 'Black is better here.', why: 'it says who is better' },
    ]);
    const e6 = lesson.positions[keyAfter('d4', 'd5', 'c4')].moves[0].notes!;
    expect(e6.map(({ text, generated }) => [text, generated])).toEqual([
      ['Your pawn backs up d5 and opens your bishop.', true],
      ['The position is equal.', undefined],
    ]);
    expect(report).toMatchObject({
      before: { book: 3, none: 1, verdict: 1, fragment: 0 },
      after: { book: 3, none: 0, verdict: 0, fragment: 0 },
      asked: 2,
      written: 2,
      retried: 1,
      refused: [],
    });
  });

  it('leaves a move unexplained when the model has no answer', async () => {
    const { lesson, report } = await explainBookMoves(LESSON, async () => new Map(), evaluate);
    expect(lesson).toEqual(LESSON);
    expect(report.unanswered).toBe(2);
  });
});
