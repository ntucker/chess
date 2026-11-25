import { describe, expect, it } from '@jest/globals';

import {
  ADVANCE,
  keyAfter,
  MAIN,
  readShippedLesson,
  SAMPLE,
  sampleView as view,
  TRAP,
  TRAP_PUNISHED,
  uci,
  uciLine,
  WITH_RARE,
  withMoves,
  withMistakeLine,
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

  it("ends a guide line where the guide's move leads off the file, as the shipped lessons do", () => {
    const lesson = readShippedLesson('caro-kann');
    const line: string[] = [];
    let entry = lesson.positions[lineKeys(line).at(-1)!];
    while (entry) {
      line.push(entry.moves[0].uci);
      entry = lesson.positions[lineKeys(line).at(-1)!];
    }
    const at = (ply: number) => lessonView({ lesson, line, ply, opponent: 1500 });
    expect(at(line.length)).toMatchObject({ place: 'end', lineEnd: line.length });
    expect(at(line.length - 1)).toMatchObject({ place: 'inside', lineEnd: undefined });
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

  it('keeps the notes of the position the last move was played in', () => {
    const played = view([...ADVANCE, 'Bf5']).playedFrom;
    expect(played.map(({ after }) => after)).toEqual([keyAfter(...ADVANCE)]);
    expect(played.every(({ before }) => before === undefined)).toBe(true);
    expect(view([]).playedFrom).toEqual([]);
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
    const LANDED = [...TRAP, 'Nxe5', 'Nxe5'];

    it('follows the guide from a marked move, in the shipped Caro-Kann', () => {
      // After 5...Qa5+? 6.Bd2 the guide's most played reply for Black is 6...Qb6, then 7.fxe4.
      const lesson = readShippedLesson('caro-kann');
      const start = ['e4', 'c6', 'd4', 'd5', 'e5', 'Bf5', 'g4', 'Be4', 'f3', 'Qa5+', 'Bd2'];
      const line = uciLine(...start);
      const trap = lessonView({ lesson, line, ply: line.length, opponent: 1500 }).trap;
      expect(trap!.trap.moves.slice(0, 4)).toEqual(['d8a5', 'c1d2', 'a5b6', 'f3e4']);
    });

    it('is absent until the punishing reply is played', () => {
      expect(view(TRAP).trap).toBeUndefined();
      expect(view([...TRAP, 'Nxe5']).trap).toBeUndefined();
      expect(view([...TRAP, 'e6']).trap).toBeUndefined();
    });

    it('lands at the punishing reply, with its note and where its tempting move is', () => {
      const { trap } = view(LANDED);
      expect(trap).toMatchObject({
        ply: TRAP.length,
        landed: keyAfter(...LANDED),
        trap: { type: 'trap', verdict: 'losesMaterial', learnerFalls: true },
      });
      expect(trap!.trap.moves).toEqual(uciLine(...TRAP_PUNISHED).slice(TRAP.length));
      expect(trap!.note).toMatchObject({
        note: expect.objectContaining({ ideas: expect.arrayContaining([trap!.trap]) }),
        after: keyAfter(...TRAP),
      });
    });

    it('lands a one-move trap at its only move', () => {
      const lesson = withMistakeLine(SAMPLE, keyAfter(...TRAP), uci(...TRAP, 'Nxe5'), []);
      const line = uciLine(...TRAP, 'Nxe5');
      expect(lessonView({ lesson, line, ply: line.length, opponent: 1500 }).trap).toMatchObject({
        ply: TRAP.length,
        landed: keyAfter(...TRAP, 'Nxe5'),
      });
    });

    it('follows the cursor, and stays as the line goes on, in the trap or out of it', () => {
      expect(view(LANDED, { ply: LANDED.length - 1 }).trap).toBeUndefined();
      expect(view(TRAP_PUNISHED).trap).toMatchObject({ ply: TRAP.length });
      expect(view([...LANDED, 'Be6']).trap).toMatchObject({ ply: TRAP.length });
    });
  });
});

describe('preview', () => {
  const drag = (from: string, to: string): Pointer => ({
    at: 'drag',
    from: from as never,
    to: to as never,
  });
  const previewing = (sans: string[], pointer: Pointer) => preview(SAMPLE, view(sans), pointer);

  it("previews a row's move, sliding it, with the move's notes and its position's", () => {
    const shown = previewing(MAIN, { at: 'row', uci: 'e4e5' });
    expect(shown).toMatchObject({ candidate: { san: 'e5' }, slide: true });
    expect(shown!.notes).toEqual(view(ADVANCE).notes);
  });

  it("previews a dragged piece's move onto the square without sliding it, with its notes", () => {
    const shown = previewing(MAIN, drag('e4', 'e5'));
    expect(shown).toMatchObject({ candidate: { san: 'e5' }, slide: false });
    expect(shown!.notes).toEqual(view(ADVANCE).notes);
    expect(previewing(MAIN, drag('e4', 'd5'))).toMatchObject({ candidate: { san: 'exd5' } });
    expect(previewing(MAIN, drag('b1', 'c3'))).toMatchObject({ candidate: { san: 'Nc3' } });
  });

  it('previews nothing elsewhere', () => {
    expect(previewing(MAIN, drag('b1', 'a3'))).toBeUndefined();
    expect(previewing(MAIN, drag('h7', 'h6'))).toBeUndefined();
    expect(previewing(MAIN, { at: 'row', uci: 'a2a3' })).toBeUndefined();
  });

  it("previews the dragged piece's move where two land on one square", () => {
    const lesson = withMoves(SAMPLE, keyAfter(...MAIN), (moves) => [
      ...moves,
      { uci: 'c1d2', games: [100, 100, 100, 100, 100] },
    ]);
    const line = uciLine(...MAIN);
    const shown = lessonView({ lesson, line, ply: line.length, opponent: 1500 });
    expect(preview(lesson, shown, drag('c1', 'd2'))).toMatchObject({ candidate: { san: 'Bd2' } });
    expect(preview(lesson, shown, drag('b1', 'd2'))).toMatchObject({ candidate: { san: 'Nd2' } });
  });

  it("previews a castle with the king dropped on its square or on the rook's", () => {
    const beforeCastling = [...ADVANCE, 'Bf5', 'Nf3', 'e6', 'Be2', 'c5'];
    const castle = { candidate: { san: 'O-O' } };
    expect(previewing(beforeCastling, drag('e1', 'g1'))).toMatchObject(castle);
    expect(previewing(beforeCastling, drag('e1', 'h1'))).toMatchObject(castle);
    expect(previewing(beforeCastling, drag('h1', 'f1'))).toBeUndefined();
  });

  describe('a rare move', () => {
    const rareView = view(MAIN, { lesson: WITH_RARE });

    it('previews when its piece is dragged there, and from its row', () => {
      expect(preview(WITH_RARE, rareView, drag('h2', 'h3'))).toMatchObject({
        candidate: { san: 'h3', rare: true },
        slide: false,
      });
      expect(preview(WITH_RARE, rareView, { at: 'row', uci: 'h2h3' })).toMatchObject({
        candidate: { san: 'h3' },
        slide: true,
      });
    });
  });
});
