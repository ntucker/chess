import { describe, expect, it } from '@jest/globals';

import {
  ADVANCE,
  keyAfter,
  MAIN,
  SAMPLE,
  sampleView as view,
  TRAP,
  TRAP_PUNISHED,
  uciLine,
  withMoves,
} from './lesson.fixture';
import { guideMove, lineKeys } from './select';
import { lessonView, type Pointer, preview } from './view';

describe('lessonView', () => {
  it('places the position in the guide, and says whether the learner is to move', () => {
    expect(view(MAIN)).toMatchObject({
      key: keyAfter(...MAIN),
      learnerToMove: false,
      place: 'inside',
    });
    expect(view(ADVANCE)).toMatchObject({ learnerToMove: true, place: 'inside' });
    expect(view([...ADVANCE, 'Bf5', 'Nf3', 'e6', 'Be2', 'c5', 'O-O', 'Nc6']).place).toBe('end');
    expect(view([...ADVANCE, 'a6']).place).toBe('beyond');
  });

  it("lists the candidates in the opponent's band", () => {
    expect(view(MAIN, { opponent: 1100 }).candidates[0].san).toBe('exd5');
    expect(view(MAIN, { opponent: 1500 }).candidates[0].san).toBe('e5');
    expect(view([...ADVANCE, 'a6']).candidates).toEqual([]);
  });

  it('shows the notes of the move that led here, then those of the position', () => {
    const keys = lineKeys(uciLine(...ADVANCE));
    const e5 = guideMove(SAMPLE, keys[4], 'e4e5')!;
    expect(view(ADVANCE).notes).toEqual([
      ...e5.notes!.map((note) => ({ note, before: keys[4], after: keys[5] })),
      ...SAMPLE.positions[keys[5]].notes!.map((note) => ({ note, after: keys[5] })),
    ]);
    expect(view([]).notes).toEqual(
      SAMPLE.positions[keys[0]].notes!.map((note) => ({ note, after: keys[0] })),
    );
    expect(view([...ADVANCE, 'a6']).notes).toEqual([]);
  });

  it('names the variation, keeping the last one passed beyond the guide', () => {
    const names = (sans: string[]) => view(sans).variation.map(({ name }) => name);
    expect(names(ADVANCE)).toEqual(['Caro-Kann Defence', 'Advance Variation']);
    expect(names([...ADVANCE, 'a6', 'Nf3'])).toEqual(['Caro-Kann Defence', 'Advance Variation']);
  });

  it('shows the position at the cursor, with every move judged against the guide', () => {
    const shown = view([...ADVANCE, 'a6'], { ply: 2 });
    expect(shown.key).toBe(keyAfter('e4', 'c6'));
    expect(shown.candidates.map(({ san }) => san)).toEqual(['d4']);
    expect(shown.variation.map(({ name }) => name)).toEqual(['Caro-Kann Defence']);
    expect(shown.guideMoves.map((move) => move?.uci)).toEqual([
      'e2e4',
      'c7c6',
      'd2d4',
      'd7d5',
      'e4e5',
      undefined,
    ]);
    expect(shown.guideMoves.map((move) => move?.book ?? false)).toEqual([
      false,
      true,
      false,
      true,
      false,
      false,
    ]);
  });

  describe('trap', () => {
    it('is absent until the whole punishment is played', () => {
      expect(view(TRAP).trap).toBeUndefined();
      expect(view(TRAP_PUNISHED.slice(0, -1)).trap).toBeUndefined();
      expect(view([...TRAP, 'e6']).trap).toBeUndefined();
    });

    it('names the trap and where its tempting move is, once it lands', () => {
      const { trap } = view(TRAP_PUNISHED);
      expect(trap).toMatchObject({
        ply: TRAP.length,
        trap: { type: 'trap', verdict: 'losesMaterial' },
      });
      expect(trap!.trap.moves).toEqual(uciLine(...TRAP_PUNISHED).slice(TRAP.length));
    });

    it('follows the cursor, and stays after the line goes on', () => {
      expect(view(TRAP_PUNISHED, { ply: TRAP_PUNISHED.length - 1 }).trap).toBeUndefined();
      expect(view([...TRAP_PUNISHED, 'a6']).trap).toMatchObject({ ply: TRAP.length });
    });

    it('is absent where the line leaves the trap', () => {
      expect(view([...TRAP, 'Nxe5', 'Nxe5', 'Bxd1', 'Kxd1']).trap).toBeUndefined();
    });
  });
});

describe('preview', () => {
  const at = (square: string): Pointer => ({ at: 'square', square: square as never });
  const previewing = (sans: string[], pointer: Pointer) => preview(SAMPLE, view(sans), pointer);

  it("previews a row's move, sliding it, with the move's notes and its position's", () => {
    const shown = previewing(MAIN, { at: 'row', uci: 'e4e5' });
    expect(shown).toMatchObject({ candidate: { san: 'e5' }, slide: true });
    expect(shown!.notes).toEqual(view(ADVANCE).notes);
  });

  it('slides the move landing on a pointed destination', () => {
    expect(previewing(MAIN, at('d5'))).toMatchObject({ candidate: { san: 'exd5' }, slide: true });
  });

  it("previews a pointed piece's most common move without sliding it", () => {
    expect(previewing(MAIN, at('b1'))).toMatchObject({ candidate: { san: 'Nc3' }, slide: false });
    expect(previewing(MAIN, at('e4'))).toMatchObject({ candidate: { san: 'e5' }, slide: false });
  });

  it('previews nothing elsewhere', () => {
    expect(previewing(MAIN, at('h7'))).toBeUndefined();
    expect(previewing(MAIN, { at: 'row', uci: 'a2a3' })).toBeUndefined();
    expect(previewing([...ADVANCE, 'a6'], at('e5'))).toBeUndefined();
  });

  it('picks the most common of two moves landing on one square', () => {
    const lesson = withMoves(SAMPLE, keyAfter(...MAIN), (moves) => [
      ...moves,
      { uci: 'c1d2', games: [100, 100, 100, 100, 100] },
    ]);
    const line = uciLine(...MAIN);
    const d2 = (opponent: 1100 | 1500) =>
      preview(lesson, lessonView({ lesson, line, ply: line.length, opponent }), at('d2'));
    // Bd2 100 against Nd2 90 in the 1000 band, but 100 against 280 in the 1400 band.
    expect(d2(1100)).toMatchObject({ candidate: { san: 'Bd2' }, slide: true });
    expect(d2(1500)).toMatchObject({ candidate: { san: 'Nd2' }, slide: true });
  });
});
