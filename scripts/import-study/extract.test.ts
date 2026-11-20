import { describe, expect, it } from '@jest/globals';

import { evaluationText, extractChapter } from './extract';
import { STUDY_PGN } from './fixture';
import { parseStudy } from './study';

const [advance, classical] = parseStudy(STUDY_PGN, () => true);
const { moveNotes, positionNotes, branches, choices, rejected, contradicted } = extractChapter(
  advance,
  'black',
);
const noteOn = (san: string) =>
  moveNotes.filter(({ move }) => move.san === san).map(({ note }) => note);

describe('extractChapter', () => {
  it('puts the chapter header where its main line ends, and its plan on the position before that move', () => {
    const [header] = noteOn('Bf5');
    expect(header.text).toBe('Idea: Against 3.e5, develop with ...Bf5, ...e6 and ...c5.');
    expect(header.original).toContain('Watch out:');
    expect(header.ideas).toBeUndefined();
    const bf5 = moveNotes.find(({ move }) => move.san === 'Bf5')!.move;
    expect(positionNotes.filter(({ pos }) => pos === bf5.before).map(({ note }) => note)).toEqual([
      {
        text: 'Your plan from here, one move at a time.',
        original: '...Bf5, ...e6 and ...c5',
        ideas: [
          {
            type: 'plan',
            side: 'black',
            routes: [
              { from: 'c8', to: 'f5' },
              { from: 'e7', to: 'e6' },
              { from: 'c6', to: 'c5' },
            ],
          },
        ],
      },
    ]);
  });

  it('reads a header whose Idea line is empty', () => {
    const [chapter] = parseStudy(
      '1. e4 { Idea:\nMain line: 1.e4 c6\nWatch out: } 1... c6 *',
      () => true,
    );
    const header = extractChapter(chapter, 'black').moveNotes.find(({ move }) => move.san === 'c6');
    expect(header?.note.original).toContain('Main line:');
  });

  it('finds a header after an "Extra:" line too', () => {
    const header = extractChapter(classical, 'black').moveNotes.find(
      ({ move }) => move.san === 'Bf5',
    );
    expect(header?.note.text).toBe('Extra: only needed if White plays 3.Nc3.');
  });

  it('reads a plan list and keeps a glyph the text does not contradict', () => {
    expect(noteOn('Nf3')).toEqual([
      {
        text: 'You plan ...e6, ...c5 and ...Nc6.',
        ideas: [
          {
            type: 'plan',
            side: 'black',
            routes: [
              { from: 'e7', to: 'e6' },
              { from: 'c6', to: 'c5' },
              { from: 'b8', to: 'c6' },
            ],
          },
          { type: 'evaluation', value: 'whiteSlightly' },
        ],
      },
    ]);
  });

  it('drops a list of moves already played, and a glyph its text contradicts', () => {
    // "After ...Bf5 and ...e6 you are slightly worse", with an "equal" glyph.
    expect(noteOn('Be2')[0].ideas).toBeUndefined();
    expect(contradicted).toBe(1);
  });

  it('reads a trap line and adds its moves to the guide', () => {
    expect(noteOn('Bd7')[0].text).toBe('5.e6? fxe6 and White is clearly worse.');
    expect(noteOn('Bd7')[0].ideas).toEqual([
      { type: 'trap', moves: ['e5e6', 'f7e6'], verdict: 'blackClearly' },
    ]);
    expect(branches.map(({ spot, ucis }) => [spot.move?.san, ucis])).toContainEqual([
      'Bd7',
      ['e5e6', 'f7e6'],
    ]);
  });

  it('turns a sequence in comment text into moves, castling as the king moves', () => {
    expect(branches.map(({ spot, ucis }) => [spot.move?.san, ucis])).toContainEqual([
      'Be2',
      ['b8d7', 'e1g1', 'g8e7'],
    ]);
  });

  it("leaves out a sequence from the start that names another opening's first move", () => {
    const [chapter] = parseStudy(
      '1. e4 c6 2. d4 d5 3. c4 { This transposes to the Slav, seen after 1.d4 d5 2.c4 c6 3.e4. } *',
      () => true,
    );
    expect(extractChapter(chapter, 'black').branches).toEqual([]);
  });

  it("leaves out a sequence from the start that leaves the chapter at the learner's move", () => {
    const [chapter] = parseStudy(
      '1. e4 c6 2. d4 d5 3. e5 { Unlike the Open Game, 1.e4 e5 2.Nf3 Nc6, Black keeps a solid centre. } *',
      () => true,
    );
    expect(extractChapter(chapter, 'black').branches).toEqual([]);
  });

  it('ends a sequence at a word between two moves', () => {
    const [chapter] = parseStudy(
      '1. e4 c5 2. Nc3 d6 { This avoids playing 2...Nc6: because 2.Nc3 only suggests a closed game. } *',
      () => true,
    );
    expect(extractChapter(chapter, 'black').branches).toEqual([]);
  });

  it('keeps a sequence whose moves an ellipsis joins', () => {
    const [chapter] = parseStudy(
      '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 { Not 4.Qxd4...Nc6 5.Qd1, which loses time. } *',
      () => true,
    );
    expect(
      extractChapter(chapter, 'black').branches.map(({ spot, ucis }) => [spot.move?.san, ucis]),
    ).toEqual([['cxd4', ['d1d4', 'b8c6', 'd4d1']]]);
  });

  it('reads castling written with zeros in a sequence', () => {
    const [chapter] = parseStudy(
      '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 { Later 5...a6 6.Bc4 e6 7.0-0 Be7 follows. } *',
      () => true,
    );
    expect(
      extractChapter(chapter, 'black').branches.map(({ spot, ucis }) => [spot.move?.san, ucis]),
    ).toEqual([['Nc3', ['a7a6', 'f1c4', 'e7e6', 'e1g1', 'f8e7']]]);
  });

  it('keeps a sequence from the start that leaves the chapter at a later opponent move', () => {
    const [chapter] = parseStudy(
      '1. e4 c6 2. d4 d5 3. Nc3 { The same as 1.e4 c6 2.Nc3 d5 3.d4. } *',
      () => true,
    );
    expect(
      extractChapter(chapter, 'black').branches.map(({ spot, ucis }) => [spot.move?.san, ucis]),
    ).toEqual([[undefined, ['e2e4', 'c7c6', 'b1c3', 'd7d5', 'd2d4']]]);
  });

  it('refuses a watch-out trap that loses nothing', () => {
    expect(rejected).toEqual([
      expect.objectContaining({ why: 'black does not lose material: balance goes 0 to 0' }),
    ]);
  });

  it('writes a trap that lands before its comment in words, the moves left to its play-through', () => {
    const [chapter] = parseStudy(
      '1. e4 c6 2. d4 d5 3. e5 Bf5 4. Nf3 { Trap: 3...c5? 4.dxc5 and Black is worse. } *',
      () => true,
    );
    const trapNote = (learner: 'white' | 'black') =>
      extractChapter(chapter, learner).positionNotes.map(({ note }) => note);
    expect(trapNote('black')).toEqual([
      {
        text: 'Pushing the pawn to c5 falls into a trap: you are worse.',
        original: 'Trap: 3...c5? 4.dxc5 and Black is worse.',
        ideas: [{ type: 'trap', moves: ['c6c5', 'd4c5'], verdict: 'whiteSlightly' }],
      },
    ]);
    expect(trapNote('white')[0].text).toBe(
      'Pushing the pawn to c5 falls into a trap: Black is worse.',
    );
  });

  it("makes a trap line that starts with the winner's move a line, saying only its result", () => {
    const [chapter] = parseStudy(
      '1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. d3 { Trap: 4.Bxf7+ Kxf7 5.Ng5+ Kg8 and Black is losing. } *',
      () => true,
    );
    expect(extractChapter(chapter, 'black').positionNotes.map(({ note }) => note)).toEqual([
      {
        text: 'You are losing at the end of this line.',
        original: 'Trap: 4.Bxf7+ Kxf7 5.Ng5+ Kg8 and Black is losing.',
        ideas: [{ type: 'line', moves: ['c4f7', 'e8f7', 'f3g5', 'f7g8'], verdict: 'whiteWinning' }],
      },
    ]);
  });

  it('turns a sacrifice line the study says mates into a winning line for the other side', () => {
    const [chapter] = parseStudy(
      '1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. d3 { Trap: 4.Bxf7+ Kxf7 5.Ng5+ Kg8 and Black gets mated. } *',
      () => true,
    );
    expect(extractChapter(chapter, 'white').positionNotes.map(({ note }) => note)).toEqual([
      {
        text: 'Black gets mated at the end of this line.',
        original: 'Trap: 4.Bxf7+ Kxf7 5.Ng5+ Kg8 and Black gets mated.',
        ideas: [{ type: 'line', moves: ['c4f7', 'e8f7', 'f3g5', 'f7g8'], verdict: 'whiteWinning' }],
      },
    ]);
  });

  it('writes a watch-out in words, and a plan for the side the learner does not play', () => {
    const [chapter] = parseStudy(
      '1. e4 { Idea: Play ...Nc6 and ...Nf6.\nMain line: 1.e4 e5\nWatch out: ...Qh4? loses material on move 2. } 1... e5 2. Nf3 Qh4 3. Nxh4 *',
      () => true,
    );
    const asWhite = extractChapter(chapter, 'white').positionNotes.map(({ note }) => note.text);
    expect(asWhite).toContain("Black's plan from here, one move at a time.");
    expect(asWhite).toContain('Moving the queen to h4 falls into a trap: Black loses material.');
    expect(extractChapter(chapter, 'black').positionNotes.map(({ note }) => note.text)).toContain(
      'Moving the queen to h4 falls into a trap: you lose material.',
    );
  });

  it('words a watch-out that drops a piece, and keeps the study line as the original', () => {
    const [chapter] = parseStudy(
      '1. e4 { Idea:\nMain line: 1.e4 e5\nWatch out: ...Bc5? drops a piece on move 2. } 1... e5 2. d4 Bc5 3. dxc5 *',
      () => true,
    );
    const notes = extractChapter(chapter, 'black').positionNotes.map(({ note }) => note);
    expect(notes).toContainEqual(
      expect.objectContaining({
        text: 'Moving the bishop to c5 falls into a trap: you drop a piece.',
        original: 'Watch out: ...Bc5? drops a piece on move 2.',
      }),
    );
  });

  it('reads the choice guide, risk included', () => {
    expect(choices.map(({ move, risk }) => [move.san, risk])).toEqual([['Bf5', 'safe']]);
  });

  it('keeps a plain comment as text', () => {
    expect(noteOn('c5')).toEqual([{ text: 'The sharper reply.' }]);
  });
});

describe('evaluationText', () => {
  it('speaks to the learner, whichever side the glyph favors', () => {
    expect(evaluationText('whiteWinning', 'white')).toBe('You are winning.');
    expect(evaluationText('whiteClearly', 'black')).toBe('You are clearly worse.');
    expect(evaluationText('blackSlightly', 'black')).toBe('You are slightly better.');
    expect(evaluationText('equal', 'white')).toBe('The position is equal.');
  });
});
