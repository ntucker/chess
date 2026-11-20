import { describe, expect, it } from '@jest/globals';

import { positionKey } from '@/game/replay';

import { extractChapter } from '../extract';
import { STUDY_PGN } from '../fixture';
import { parseStudy } from '../study';
import type { AnswerNote } from './answer';
import { MODELS, type Ask, type Model } from './claude';
import { noteComment, type Comment } from './comments';
import { DRAW_MISTAKES, REWORD, SHORTEN, WRITTEN_FOR_OPPONENT } from './prompt';
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
  const addenda: (string | undefined)[] = [];
  const seen: Comment[] = [];
  const ask: Ask = async (model, comments, addendum) => {
    asked.push([model, comments.map((comment) => comment.move)]);
    refused.push(...comments.map((comment) => comment.refusedText));
    addenda.push(addendum);
    seen.push(...comments);
    return new Map(
      comments.flatMap((comment) => {
        const again = comment.refusedText ?? comment.mistakes ?? comment.cutText;
        const notes = (again ? reworded : answers)[model]?.[comment.move];
        return notes ? [[comment.id, { id: comment.id, notes }]] : [];
      }),
    );
  };
  return { ask, asked, refused, addenda, seen };
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
      const { ask, asked, refused, addenda } = fakeAsk(
        { [MODELS.convert]: { Be2: notation } },
        { [MODELS.retry]: { Be2: words } },
      );
      const {
        extracted: [chapter],
        report,
      } = await convertChapters(extracted, ask);
      expect(asked.at(-1)).toEqual([MODELS.retry, ['Be2']]);
      expect(refused.at(-1)).toEqual([notation[0].text]);
      expect(addenda.at(-1)).toBe(REWORD);
      expect(report.reworded).toBe(1);
      expect(notesOn(chapter, 'Be2')[0].text).toBe(words[0].text);
    });

    it('is replaced by the answer in words even when it draws less, and the report says so', async () => {
      const drawn: AnswerNote = {
        ...notation[0],
        ideas: [{ type: 'purpose', from: 'f5', relation: 'attacks', targets: ['c2'] }],
      };
      const { ask } = fakeAsk(
        { [MODELS.convert]: { Be2: [drawn] } },
        { [MODELS.retry]: { Be2: words } },
      );
      const {
        extracted: [chapter],
        report,
      } = await convertChapters(extracted, ask);
      expect(notesOn(chapter, 'Be2')[0].text).toBe(words[0].text);
      expect(report.rewordedIdeas).toEqual({ before: 1, after: 0 });
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

  it('asks again of Opus for a note cut at the word limit, keeping a whole sentence', async () => {
    const long =
      'With the knight check on g5, retreating the king to g8 or h8 loses at once, and taking on g5 is bad.';
    const whole = 'With the knight check on g5, every king move loses at once.';
    const { ask, asked, addenda, seen } = fakeAsk(
      { [MODELS.convert]: { Be2: [{ about: 'move', text: long, ideas: [] }] } },
      { [MODELS.retry]: { Be2: [{ about: 'move', text: whole, ideas: [] }] } },
    );
    const {
      extracted: [chapter],
      report,
    } = await convertChapters(extracted, ask);
    expect(asked.at(-1)).toEqual([MODELS.retry, ['Be2']]);
    expect(addenda.at(-1)).toBe(SHORTEN);
    expect(seen.at(-1)?.cutText?.[0]).toMatch(/taking on g5…$/);
    expect(report.shortened).toBe(1);
    expect(notesOn(chapter, 'Be2')[0].text).toBe(whole);
  });
  describe('a comment marking a move as a mistake', () => {
    // After 2...h5 White is to move: the comment says 3.e3? walks into ...e5.
    const [h5] = parseStudy(
      '[Event "h5"]\n\n1. d4 d5 2. Bf4 h5 { 3.e3? e5 4.Bxe5 f6 traps the bishop. } *\n',
      () => true,
    );
    const mistake = [extractChapter(h5, 'white')];
    const claim: AnswerNote[] = [
      { about: 'move', text: 'Careful: e3 now lets Black trap your bishop.', ideas: [] },
    ];
    const drawn: AnswerNote[] = [
      {
        about: 'move',
        text: 'Careful: e3 now lets Black trap your bishop.',
        ideas: [{ type: 'trap', moves: ['e3', 'e5', 'Bxe5', 'f6'], verdict: 'blackSlightly' }],
      },
    ];

    it('is asked again of Opus until a note draws how the mistake is punished', async () => {
      const { ask, asked, addenda, seen } = fakeAsk(
        { [MODELS.convert]: { h5: claim } },
        { [MODELS.retry]: { h5: drawn } },
      );
      const {
        extracted: [chapter],
        report,
      } = await convertChapters(mistake, ask);
      expect(asked.at(-1)).toEqual([MODELS.retry, ['h5']]);
      expect(addenda.at(-1)).toBe(DRAW_MISTAKES);
      expect(seen.at(-1)?.mistakes).toEqual(['e3']);
      expect(report.punished).toBe(1);
      expect(notesOn(chapter, 'h5')[0].ideas).toEqual([
        { type: 'trap', moves: ['e2e3', 'e7e5', 'f4e5', 'f7f6'], verdict: 'blackSlightly' },
      ]);
    });

    it('keeps the first notes when the retry draws nothing more, or has no answer', async () => {
      for (const retry of [{ h5: claim }, {}] as Record<string, AnswerNote[]>[]) {
        const { ask } = fakeAsk({ [MODELS.convert]: { h5: claim } }, { [MODELS.retry]: retry });
        const {
          extracted: [chapter],
        } = await convertChapters(mistake, ask);
        expect(notesOn(chapter, 'h5')).toEqual([
          { text: claim[0].text, original: expect.any(String) },
        ]);
      }
    });

    it('asks a cut note to keep drawing its mistakes, and refuses a shorter one that drops them', async () => {
      const long =
        'Careful: e3 now lets Black push e5, and after taking it your bishop is trapped by f6 and lost for a pawn or two.';
      const wordy: AnswerNote[] = [{ ...drawn[0], text: long }];
      const short: AnswerNote[] = [
        { about: 'move', text: 'Careful: e3 now traps your bishop.', ideas: [] },
      ];
      for (const [retry, kept] of [
        [drawn, drawn[0].text],
        [short, `${long.split(' ').slice(0, 20).join(' ')}…`],
      ] as const) {
        const { ask, addenda, seen } = fakeAsk(
          { [MODELS.convert]: { h5: wordy } },
          { [MODELS.retry]: { h5: [...retry] } },
        );
        const {
          extracted: [chapter],
        } = await convertChapters(mistake, ask);
        expect(addenda.at(-1)).toBe(DRAW_MISTAKES + SHORTEN);
        expect(seen.at(-1)?.mistakes).toEqual(['e3']);
        expect(notesOn(chapter, 'h5')[0].text).toBe(kept);
      }
    });

    it('reads only mistakes numbered as the next move, by the side to move', async () => {
      // White is to move at move 3: 4.e3 lies deeper in a line, and 3...Nc3 is Black's.
      const [later] = parseStudy(
        '[Event "later"]\n\n1. d4 d5 2. Bf4 h5 { 3.Nf3 e6 4.e3? Bd6, or 3.c4 and 3...Nc3?, are other stories. } *\n',
        () => true,
      );
      const { ask, asked } = fakeAsk({ [MODELS.convert]: { h5: claim } });
      const { report } = await convertChapters([extractChapter(later, 'white')], ask);
      expect(asked).toEqual([[MODELS.convert, ['h5']]]);
      expect(report.punished).toBe(0);
    });

    it('reads ? and ?? as mistakes, but not ?! or a move with no number to place it', async () => {
      for (const [text, mistakes] of [
        ['3.e3?? e5 traps the bishop.', ['e3']],
        ['3.e3?! e5 traps the bishop.', undefined],
        ['e3? e5 traps the bishop.', undefined],
      ] as const) {
        const [chapter] = parseStudy(
          `[Event "h5"]\n\n1. d4 d5 2. Bf4 h5 { ${text} } *\n`,
          () => true,
        );
        const { ask, seen } = fakeAsk({ [MODELS.convert]: { h5: claim } });
        await convertChapters([extractChapter(chapter, 'white')], ask);
        expect(seen.at(-1)?.mistakes).toEqual(mistakes);
      }
    });

    it('is not asked again when a note already draws it', async () => {
      const { ask, asked } = fakeAsk({ [MODELS.convert]: { h5: drawn } });
      const { report } = await convertChapters(mistake, ask);
      expect(asked).toEqual([[MODELS.convert, ['h5']]]);
      expect(report.punished).toBe(0);
    });
  });

  it('tells the model when a comment was written for the other side, asking the rest as before', async () => {
    const [london] = parseStudy(
      '[Event "London"]\n\n1. d4 d5 2. Bf4 { You develop your bishop first. } *\n',
      () => true,
    );
    const theirs = extractChapter({ ...london, writtenFor: 'white' }, 'black');
    const { ask, asked, addenda, seen } = fakeAsk({});
    await convertChapters([extracted[0], theirs], ask);
    expect(addenda).toEqual(['', WRITTEN_FOR_OPPONENT]);
    expect(asked[1]).toEqual([MODELS.convert, ['Bf4']]);
    // Only the London chapter's comment, asked last, carries the side it was written for.
    expect(seen.at(-1)?.writtenFor).toBe('white');
    expect(seen.slice(0, -1).filter((comment) => comment.writtenFor)).toEqual([]);
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
