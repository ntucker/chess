import { describe, expect, it } from '@jest/globals';

import type { PlayedMove } from './practice';
import { initialScreen, type ScreenAction, screenReducer } from './screen';

const POINT: ScreenAction = { type: 'candidate', key: 'k', candidate: { at: 'row', uci: 'e2e4' } };
const PRACTICE: ScreenAction = { type: 'modeChosen', mode: 'practice', untouched: true };
const SLIP: PlayedMove = { learner: true, book: false, first: false, replaces: false };
const run = (...actions: ScreenAction[]) => actions.reduce(screenReducer, initialScreen);

describe('screenReducer', () => {
  it('sends a mode action to the mode, and keeps the peek', () => {
    const pointing = run(POINT);
    const practice = screenReducer(pointing, PRACTICE);
    expect(practice).toEqual({
      mode: { mode: 'practice', clean: true },
      peek: pointing.peek,
    });
  });

  it('sends a played move to the mode, and keeps the peek', () => {
    const pointing = run(PRACTICE, POINT);
    expect(screenReducer(pointing, { type: 'played', ...SLIP })).toEqual({
      mode: { mode: 'practice', clean: false },
      peek: pointing.peek,
    });
  });

  it('sends a peek action to the peek, and keeps the mode', () => {
    const practice = run(PRACTICE);
    const pointing = screenReducer(practice, POINT);
    expect(pointing.mode).toBe(practice.mode);
    expect(pointing.peek).toMatchObject({ kind: 'point', candidate: { at: 'row', uci: 'e2e4' } });
  });

  it("shows a position's rare rows until they are hidden or the board moves on", () => {
    const shown = run(POINT, { type: 'rare', key: 'k', shown: true });
    expect(shown.rareShown).toBe('k');
    expect(shown.peek).toBeDefined();
    const hidden = screenReducer(shown, { type: 'rare', key: 'k', shown: false });
    expect(hidden.rareShown).toBeUndefined();
    expect(screenReducer(shown, { type: 'board', key: 'k' })).toBe(shown);
    const movedOn = screenReducer(shown, { type: 'board', key: 'other' });
    expect(movedOn).toEqual({ mode: shown.mode, peek: undefined, rareShown: undefined });
  });

  it('keeps the same state when nothing changes', () => {
    expect(screenReducer(initialScreen, { type: 'rare', key: 'k', shown: false })).toBe(
      initialScreen,
    );
    expect(screenReducer(initialScreen, { type: 'leave' })).toBe(initialScreen);
    const explore: ScreenAction = { type: 'modeChosen', mode: 'explore', untouched: true };
    expect(screenReducer(initialScreen, explore)).toBe(initialScreen);
  });
});
