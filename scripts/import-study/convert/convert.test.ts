import { describe, expect, it } from '@jest/globals';

import { positionKey } from '@/game/replay';

import { extractChapter } from '../extract';
import { STUDY_PGN } from '../fixture';
import { parseStudy } from '../study';
import type { AnswerNote } from './answer';
import { MODELS, type Ask, type Model } from './claude';
import { noteComment, type Comment } from './comments';
import { convertChapters } from '.';

const [advance] = parseStudy(STUDY_PGN, () => true);
const extracted = [extractChapter(advance, 'black')];

type Answers = Partial<Record<Model, Record<string, AnswerNote[]>>>;

/**
 * An `Ask` answering each comment by its move, per model, and recording what
 * was asked. A comment asked again for refused text is answered from `reworded`.
 */
function fakeAsk(answers: Answers, reworded: Answers = {}) {
  const asked: [Model, string[]][] = [];
  const refused: (readonly string[] | undefined)[] = [];
  const ask: Ask = async (model, comments) => {
    asked.push([model, comments.map((comment) => comment.move)]);
    refused.push(...comments.map((comment) => comment.refusedText));
    const notes = (comments[0]?.refusedText ? reworded : answers)[model] ?? {};
    return new Map(
      comments.flatMap((comment) =>
        notes[comment.move] ? [[comment.id, { id: comment.id, notes: notes[comment.move] }]] : [],
      ),
    );
  };
  return { ask, asked, refused };
}

const notesOn = (
  chapter: Awaited<ReturnType<typeof convertChapters>>['extracted'][number],
  san: string,
) => chapter.moveNotes.filter(({ move }) => move.san === san).map(({ note }) => note);

describe('convertChapters', () => {
  it('rewrites a note, keeps the importer’s ideas, and turns SAN into checked UCI', async () => {
    const { ask } = fakeAsk({
      [MODELS.convert]: {
        Nf3: [
          {
            about: 'move',
            text: 'Plan: Develop with e6 and c5, then bring your knight to c6.',
            ideas: [
              { type: 'threat', side: 'white', move: 'Nh4', answer: 'e6' },
              // Black is to move, so this is no threat; and an evaluation was already read from the glyph.
              { type: 'threat', side: 'black', move: 'e6' },
              { type: 'evaluation', value: 'equal' },
              // d6 is empty: the checker refuses it.
              { type: 'purpose', from: 'e5', relation: 'attacks', targets: ['d6'] },
            ],
          },
        ],
      },
    });
    const {
      extracted: [chapter],
      report,
    } = await convertChapters(extracted, ask);
    const [note] = notesOn(chapter, 'Nf3');
    expect(note.text).toBe('Develop with e6 and c5, then bring your knight to c6.');
    expect(note.original).toBe('You plan ...e6, ...c5 and ...Nc6.');
    expect(note.ideas?.map((idea) => idea.type)).toEqual(['plan', 'evaluation', 'threat']);
    expect(note.ideas?.at(-1)).toEqual({
      type: 'threat',
      side: 'white',
      move: 'f3h4',
      answer: 'e7e6',
    });
    expect(report.rejected.map(({ why }) => why)).toEqual([
      'a threat is never a move by the side to move',
      'an evaluation was already extracted',
      'no enemy piece on d6 (use controls for a square)',
    ]);
  });

  it('puts a note about the position before the move on that position', async () => {
    const { ask } = fakeAsk({
      [MODELS.convert]: {
        Nf3: [
          { about: 'move', text: 'You develop next.', ideas: [] },
          {
            about: 'before',
            text: 'White can bring the knight out to f3.',
            ideas: [{ type: 'purpose', from: 'g1', relation: 'controls', targets: ['f3'] }],
          },
        ],
      },
    });
    const {
      extracted: [chapter],
    } = await convertChapters(extracted, ask);
    const nf3 = chapter.moveNotes.find(({ move }) => move.san === 'Nf3')!.move;
    expect(
      chapter.positionNotes.filter(({ pos }) => pos === nf3.before).map(({ note }) => note),
    ).toContainEqual({
      text: 'White can bring the knight out to f3.',
      original: 'You plan ...e6, ...c5 and ...Nc6.',
      ideas: [{ type: 'purpose', from: 'g1', relation: 'controls', targets: ['f3'] }],
    });
  });

  it('asks Opus again when every idea was refused, and keeps the answer with more ideas', async () => {
    const wrong: AnswerNote[] = [
      {
        about: 'move',
        text: 'Your bishop hits e4.',
        ideas: [{ type: 'purpose', from: 'c8', relation: 'attacks', targets: ['e4'] }],
      },
    ];
    const right: AnswerNote[] = [
      {
        about: 'move',
        text: 'Your bishop eyes the c2 pawn.',
        ideas: [{ type: 'purpose', from: 'f5', relation: 'attacks', targets: ['c2'] }],
      },
    ];
    const { ask, asked } = fakeAsk({
      [MODELS.convert]: { Be2: wrong },
      [MODELS.retry]: { Be2: right },
    });
    const {
      extracted: [chapter],
      report,
    } = await convertChapters(extracted, ask);
    expect(asked.at(-1)).toEqual([MODELS.retry, ['Be2']]);
    expect(report.retried).toBe(1);
    expect(notesOn(chapter, 'Be2')[0].text).toBe('Your bishop eyes the c2 pawn.');
  });

  describe('a note written in notation', () => {
    const notation: AnswerNote[] = [
      { about: 'move', text: 'You follow up with e6 Nf3 c5 Be2 next.', ideas: [] },
    ];
    const words: AnswerNote[] = [
      { about: 'move', text: 'Your bishop is out, so build the chain and hit d4.', ideas: [] },
    ];

    it('is asked again of Opus with the refused text, and the answer in words replaces it', async () => {
      const { ask, asked, refused } = fakeAsk(
        { [MODELS.convert]: { Be2: notation } },
        { [MODELS.retry]: { Be2: words } },
      );
      const {
        extracted: [chapter],
        report,
      } = await convertChapters(extracted, ask);
      expect(asked.at(-1)).toEqual([MODELS.retry, ['Be2']]);
      expect(refused.at(-1)).toEqual([notation[0].text]);
      expect(report.reworded).toBe(1);
      expect(notesOn(chapter, 'Be2')[0].text).toBe(words[0].text);
    });

    it('stays when Opus writes notation too, so the lesson checker refuses the import', async () => {
      const { ask } = fakeAsk(
        { [MODELS.convert]: { Be2: notation } },
        { [MODELS.retry]: { Be2: [{ ...notation[0], text: 'Then e6 c5 Nc6 Qb6.' }] } },
      );
      const {
        extracted: [chapter],
      } = await convertChapters(extracted, ask);
      expect(notesOn(chapter, 'Be2')[0].text).toBe(notation[0].text);
    });

    it('is not asked again when the text is in words', async () => {
      const { ask, refused } = fakeAsk({ [MODELS.convert]: { Be2: words } });
      const { report } = await convertChapters(extracted, ask);
      expect(refused.every((text) => text === undefined)).toBe(true);
      expect(report.reworded).toBe(0);
    });
  });

  it('keeps the importer’s note where the model gave no answer', async () => {
    const { ask } = fakeAsk({});
    const {
      extracted: [chapter],
      report,
    } = await convertChapters(extracted, ask);
    expect(chapter.moveNotes).toEqual(extracted[0].moveNotes);
    expect(report.unconverted).toBe(report.comments);
  });

  it('keeps the importer’s note when the answer has no note at all', async () => {
    const { ask } = fakeAsk({ [MODELS.convert]: { Be2: [] } });
    const {
      extracted: [chapter],
    } = await convertChapters(extracted, ask);
    expect(notesOn(chapter, 'Be2')).toEqual(notesOn(extracted[0], 'Be2'));
  });

  it('joins the importer’s note on the position before the move to the model’s note there', async () => {
    const [trapped] = parseStudy(
      '1. e4 c6 2. d4 d5 3. e5 Bf5 4. Nf3 e6 { Trap: 4...Qb6? 5.Nc3 e6 6.Na4 and Black is clearly worse. } *',
      () => true,
    );
    const chapters = [extractChapter(trapped, 'black')];
    const e6 = chapters[0].moveNotes.find(({ move }) => move.san === 'e6')!.move;
    const { ask } = fakeAsk({
      [MODELS.convert]: {
        e6: [
          { about: 'move', text: 'You build your chain calmly.', ideas: [] },
          { about: 'before', text: 'Grabbing b2 with the queen here gets her chased.', ideas: [] },
        ],
      },
    });
    const {
      extracted: [chapter],
    } = await convertChapters(chapters, ask);
    const before = chapter.positionNotes.filter(
      ({ pos }) => positionKey(pos) === positionKey(e6.before),
    );
    expect(before.map(({ note }) => note.text)).toEqual([
      'Grabbing b2 with the queen here gets her chased.',
    ]);
    expect(before[0].note.ideas?.map((idea) => idea.type)).toEqual(['trap']);
  });

  it('cuts a sentence over the word limit', async () => {
    const long =
      'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twentyone.';
    const { ask } = fakeAsk({
      [MODELS.convert]: { Be2: [{ about: 'move', text: long, ideas: [] }] },
    });
    const {
      extracted: [chapter],
    } = await convertChapters(extracted, ask);
    expect(notesOn(chapter, 'Be2')[0].text.split(' ')).toHaveLength(20);
  });
});

describe('noteComment', () => {
  const commentOn = (pgn: string, san: string): Comment | undefined => {
    const [chapter] = parseStudy(pgn, () => true);
    const notes = extractChapter(chapter, 'black');
    const moveNote = notes.moveNotes.find(({ move }) => move.san === san)!;
    return noteComment(moveNote, notes);
  };

  it('joins a fragment starting with "..." to the comment before it', () => {
    const comment = commentOn(
      '1. e4 { White takes the centre. } 1... c6 2. d4 { ...and builds a big one. } *',
      'd4',
    );
    expect(comment?.comment).toBe('White takes the centre. ...and builds a big one.');
    expect(comment?.previousComment).toBe('');
  });

  it('leaves a comment that starts with a move alone', () => {
    const comment = commentOn(
      '1. e4 { White takes the centre. } 1... c6 2. d4 { ...d5 is the answer. } *',
      'd4',
    );
    expect(comment?.comment).toBe('...d5 is the answer.');
    expect(comment?.previousComment).toBe('White takes the centre.');
  });

  it('gives the position: the line, whose turn, the pieces and the legal moves', () => {
    const comment = commentOn('1. e4 c6 2. d4 { The centre. } *', 'd4')!;
    expect(comment).toMatchObject({
      line: '1.e4 c6 2.d4',
      move: 'd4',
      moved: 'white',
      toMove: 'black',
      check: false,
    });
    expect(comment.piecesAfter.white).toContain('Pd4');
    expect(comment.legalAfter).toContain('d5');
  });
});
