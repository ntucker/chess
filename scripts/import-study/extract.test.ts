import { describe, expect, it } from '@jest/globals';

import { extractChapter } from './extract';
import { STUDY_PGN } from './fixture';
import { parseStudy } from './study';

const [advance] = parseStudy(STUDY_PGN, () => true);
const { notes, branches, choices, rejected, contradicted } = extractChapter(advance, 'black');
const noteOn = (san: string) => notes.filter(({ move }) => move?.san === san).map(({ note }) => note);

describe('extractChapter', () => {
  it('puts the chapter header where its main line ends, with its plan before that move', () => {
    const [header] = noteOn('Bf5');
    expect(header.text).toBe('Idea: Against 3.e5, develop with ...Bf5, ...e6 and ...c5.');
    expect(header.original).toContain('Watch out:');
    expect(header.ideas).toEqual([
      {
        type: 'plan',
        side: 'black',
        routes: [
          { from: 'c8', to: 'f5' },
          { from: 'e7', to: 'e6' },
          { from: 'c6', to: 'c5' },
        ],
        at: 'before',
      },
    ]);
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
    expect(noteOn('Bd7')[0].ideas).toEqual([{ type: 'trap', moves: ['e5e6', 'f7e6'], verdict: 'blackClearly' }]);
    expect(branches.map(({ spot, ucis }) => [spot.move?.san, ucis])).toContainEqual(['Bd7', ['e5e6', 'f7e6']]);
  });

  it('turns a sequence in comment text into moves, castling as the king moves', () => {
    expect(branches.map(({ spot, ucis }) => [spot.move?.san, ucis])).toContainEqual(['Be2', ['b8d7', 'e1g1', 'g8e7']]);
  });

  it('refuses a watch-out trap that loses nothing', () => {
    expect(rejected).toEqual([
      expect.objectContaining({ why: 'black does not lose material: balance goes 0 to 0' }),
    ]);
  });

  it('reads the choice guide, risk included', () => {
    expect(choices.map(({ move, risk }) => [move.san, risk])).toEqual([['Bf5', 'safe']]);
  });

  it('keeps a plain comment as text', () => {
    expect(noteOn('c5')).toEqual([{ text: 'The sharper reply.' }]);
  });
});
