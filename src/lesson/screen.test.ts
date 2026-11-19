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

  const RARE = ['e2e4', 'h2h3'];
  const rare = (shown: boolean, rows = RARE): ScreenAction => ({
    type: 'rare',
    key: 'k',
    shown,
    rows,
  });

  it("shows a position's rare rows until they are hidden or the board moves on", () => {
    const shown = run(rare(true, []));
    expect(shown.rareKey).toBe('k');
    const hidden = screenReducer(shown, rare(false, []));
    expect(hidden.rareKey).toBeUndefined();
    expect(screenReducer(shown, { type: 'board', key: 'k' })).toBe(shown);
    const movedOn = screenReducer(shown, { type: 'board', key: 'other' });
    expect(movedOn).toEqual({ mode: shown.mode, peek: undefined, rareKey: undefined });
  });

  it('ends a peek from another position when the board moves on, and keeps one from here', () => {
    const pointing = run(POINT);
    expect(screenReducer(pointing, { type: 'board', key: 'k' })).toBe(pointing);
    expect(screenReducer(pointing, { type: 'board', key: 'other' }).peek).toBeUndefined();
  });

  it("ends a hidden row's preview, so showing the rows again doesn't bring it back", () => {
    const again = run(rare(true), POINT, rare(false), rare(true));
    expect(again.rareKey).toBe('k');
    expect(again.peek?.candidate).toBeUndefined();
  });

  it("keeps a listed row's preview, a dragged piece's, and the card's note when rows hide", () => {
    const listed = run(rare(true), POINT);
    expect(screenReducer(listed, rare(false, ['h2h3'])).peek).toBe(listed.peek);
    const drag: ScreenAction = {
      type: 'candidate',
      key: 'k',
      candidate: { at: 'drag', from: 'e2', to: 'e4' },
    };
    const dragging = run(rare(true), drag);
    expect(screenReducer(dragging, rare(false)).peek).toBe(dragging.peek);
    const note = { text: 'A note.' };
    const noted = run(rare(true), POINT, { type: 'note', key: 'k', note }, rare(false));
    expect(noted.peek).toMatchObject({ candidate: undefined, note });
  });

  it('keeps the same state when nothing changes', () => {
    expect(screenReducer(initialScreen, rare(false))).toBe(initialScreen);
    expect(screenReducer(initialScreen, { type: 'leave' })).toBe(initialScreen);
    const explore: ScreenAction = { type: 'modeChosen', mode: 'explore', untouched: true };
    expect(screenReducer(initialScreen, explore)).toBe(initialScreen);
  });
});
