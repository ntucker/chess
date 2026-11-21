import { describe, expect, it } from '@jest/globals';

import { OPPONENTS } from '@/opponent/opponent';

import { DEFAULT_SETTINGS, parseSettings, settingsReducer } from './settings';

describe('settings', () => {
  it('ranks the opponents from Maia 1100 up to full Stockfish', () => {
    expect(OPPONENTS).toEqual([
      1100,
      1200,
      1300,
      1400,
      1500,
      1600,
      1700,
      1800,
      1900,
      'stockfish',
      'stockfish-full',
    ]);
  });

  it('reads back what it saved', () => {
    const chosen = settingsReducer(DEFAULT_SETTINGS, {
      type: 'chosen',
      choice: { opponent: 'stockfish' },
    });
    expect(chosen).toEqual({ ...DEFAULT_SETTINGS, opponent: 'stockfish' });
    const rated = {
      opponent: 1900,
      evaluationEngine: 'maia',
      auto: false,
      showMoves: false,
      showTraps: true,
      side: 'white',
    } as const;
    expect(parseSettings(JSON.stringify(rated))).toEqual(rated);
  });

  it('reads a value that is missing or no longer a choice as its default', () => {
    expect(parseSettings('{"opponent":1550,"evaluationEngine":"maia","auto":"no"}')).toEqual({
      ...DEFAULT_SETTINGS,
      opponent: 1500,
      evaluationEngine: 'maia',
    });
    expect(parseSettings('{"opponent":"1900"}')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('not json')).toEqual(DEFAULT_SETTINGS);
  });
});
