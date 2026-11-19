import { describe, expect, it } from '@jest/globals';

import type { Lesson } from './lesson';
import { MAIN, SAMPLE, uciLine } from './sample.fixture';
import { candidates, lineKeys } from './select';
import { lessonView, type LessonViewInput, pointed, type Pointer } from './view';

const view = (sans: string[], input: Partial<LessonViewInput> = {}) => {
  const line = uciLine(...sans);
  return lessonView({ lesson: SAMPLE, line, ply: line.length, opponent: 1500, ...input });
};
const keysOf = (...sans: string[]) => lineKeys(uciLine(...sans));

const ADVANCE = [...MAIN, 'e5'];
/** White's c3 sets a trap: ...Nxe5? Nxe5 Bxd1 Bb5+ wins material for White. */
const TRAP = [...ADVANCE, 'c5', 'dxc5', 'Nc6', 'Nf3', 'Bg4', 'c3'];

describe('lessonView', () => {
  it('places the position in the guide, and says whose turn it is', () => {
    expect(view(MAIN)).toMatchObject({
      key: keysOf(...MAIN)[4],
      turn: 'white',
      learnerToMove: false,
      place: 'inside',
    });
    expect(view(ADVANCE)).toMatchObject({ turn: 'black', learnerToMove: true, place: 'inside' });
    expect(view([...ADVANCE, 'Bf5', 'Nf3', 'e6', 'Be2', 'c5', 'O-O', 'Nc6']).place).toBe('end');
    expect(view([...ADVANCE, 'a6']).place).toBe('beyond');
  });

  it("lists the candidates in the opponent's band", () => {
    expect(view(MAIN, { opponent: 1100 }).candidates[0].san).toBe('exd5');
    expect(view(MAIN, { opponent: 1500 }).candidates[0].san).toBe('e5');
    expect(view([...ADVANCE, 'a6']).candidates).toEqual([]);
  });

  it('shows the notes of the move that led here, then those of the position', () => {
    const keys = keysOf(...ADVANCE);
    const { notes } = view(ADVANCE);
    const e5 = SAMPLE.positions[keys[4]].moves.find(({ uci }) => uci === 'e4e5')!;
    expect(notes).toEqual([
      ...e5.notes!.map((note) => ({ note, on: 'move', before: keys[4], after: keys[5] })),
      ...SAMPLE.positions[keys[5]].notes!.map((note) => ({
        note,
        on: 'position',
        before: keys[5],
        after: keys[5],
      })),
    ]);
    expect(view([]).notes.map(({ on }) => on)).toEqual(['position']);
    expect(view([...ADVANCE, 'a6']).notes).toEqual([]);
  });

  it('names the variation, keeping the last one passed beyond the guide', () => {
    const names = (sans: string[]) => view(sans).variation.map(({ name }) => name);
    expect(names(MAIN)).toEqual(['Caro-Kann Defence']);
    expect(names(ADVANCE)).toEqual(['Caro-Kann Defence', 'Advance Variation']);
    expect(names([...ADVANCE, 'a6', 'Nf3'])).toEqual(['Caro-Kann Defence', 'Advance Variation']);
  });

  it('shows the position at the cursor, with every move judged against the guide', () => {
    const shown = view([...ADVANCE, 'a6'], { ply: 2 });
    expect(shown.key).toBe(keysOf('e4', 'c6')[2]);
    expect(shown.candidates.map(({ san }) => san)).toEqual(['d4']);
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

  it("passes on Stockfish's view", () => {
    expect(view(MAIN).top).toEqual([]);
    expect(view(MAIN, { engine: { best: 'e4e5', top: ['e4e5', 'b1c3', 'e4d5'] } })).toMatchObject({
      best: 'e4e5',
      top: ['e4e5', 'b1c3', 'e4d5'],
    });
  });

  describe('trap', () => {
    it('is absent until the tempting move is played', () => {
      expect(view(TRAP).trap).toBeUndefined();
      expect(view([...TRAP, 'e6']).trap).toBeUndefined();
    });

    it('counts how much of the trap the line has played', () => {
      const trap = view([...TRAP, 'Nxe5', 'Nxe5']).trap!;
      expect(trap).toMatchObject({ ply: TRAP.length, played: 2 });
      expect(trap.trap.moves).toHaveLength(8);
      expect(view([...TRAP, 'Nxe5']).trap!.played).toBe(1);
      expect(
        view([...TRAP, 'Nxe5', 'Nxe5', 'Bxd1', 'Bb5+', 'Qd7', 'Bxd7+', 'Kd8', 'Kxd1']).trap!.played,
      ).toBe(8);
    });

    it('follows the cursor, and stops counting where the line leaves the trap', () => {
      const line = [...TRAP, 'Nxe5', 'Nxe5', 'Bxd1', 'Kxd1'];
      expect(view(line, { ply: TRAP.length }).trap).toBeUndefined();
      expect(view(line).trap!.played).toBe(3);
    });
  });

  describe('preview', () => {
    const at = (square: string): Pointer => ({ at: 'square', square: square as never });

    it("previews a row's move, sliding it, with the move's notes and its position's", () => {
      const { preview } = view(MAIN, { pointer: { at: 'row', uci: 'e4e5' } });
      expect(preview).toMatchObject({ candidate: { san: 'e5' }, slide: true });
      expect(preview!.notes).toEqual(view(ADVANCE).notes);
    });

    it('slides the move landing on a pointed destination', () => {
      expect(view(MAIN, { pointer: at('d5') }).preview).toMatchObject({
        candidate: { san: 'exd5' },
        slide: true,
      });
    });

    it("previews a pointed piece's most common move without sliding it", () => {
      expect(view(MAIN, { pointer: at('b1') }).preview).toMatchObject({
        candidate: { san: 'Nc3' },
        slide: false,
      });
      expect(view(MAIN, { pointer: at('e4') }).preview).toMatchObject({
        candidate: { san: 'e5' },
        slide: false,
      });
    });

    it('previews nothing elsewhere', () => {
      expect(view(MAIN, { pointer: at('h7') }).preview).toBeUndefined();
      expect(view(MAIN, { pointer: { at: 'row', uci: 'a2a3' } }).preview).toBeUndefined();
      expect(view([...ADVANCE, 'a6'], { pointer: at('e5') }).preview).toBeUndefined();
    });

    it('picks the most common of two moves landing on one square', () => {
      const key = keysOf(...MAIN)[4];
      const entry = SAMPLE.positions[key];
      const bishop = { uci: 'c1d2', games: [100, 100, 100, 100, 100] };
      const lesson: Lesson = {
        ...SAMPLE,
        positions: { ...SAMPLE.positions, [key]: { ...entry, moves: [...entry.moves, bishop] } },
      };
      // Bd2 100 against Nd2 90 in the 1000 band, but 100 against 280 in the 1400 band.
      expect(pointed(candidates(lesson, key, 0), at('d2'))).toMatchObject({
        candidate: { san: 'Bd2' },
        slide: true,
      });
      expect(pointed(candidates(lesson, key, 2), at('d2'))).toMatchObject({
        candidate: { san: 'Nd2' },
        slide: true,
      });
    });
  });
});
