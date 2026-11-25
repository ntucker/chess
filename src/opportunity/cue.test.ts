import { describe, expect, it } from '@jest/globals';

import { playLine, readPositionKey, sanToUci } from '@/game/replay';
import type { Lesson, Uci } from '@/lesson/lesson';
import { readShippedLesson, shippedIds, uciLine } from '@/lesson/lesson.fixture';
import { mistakeLine } from '@/lesson/mistakes';
import { candidates, lineKeys } from '@/lesson/select';
import { lessonView } from '@/lesson/view';

import { lineCue, payoffAt, payoffReplies } from './cue';

// Black's Berlin: after 4.d3 Ne7, White's 5.Nxe5? is marked, and the line
// punishes it with 5...c6 6.Bc4 Qa5+, forking king and knight. The guide
// books no move at the cue: 5...c6 is the line's reply, off the book.
const BERLIN = readShippedLesson('berlin');
const SETUP = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Nf6', 'd3', 'Ne7'];
const LINE = [...SETUP, 'Nxe5', 'c6', 'Bc4', 'Qa5+'];
const moves = (count: number) => uciLine(...LINE).slice(0, count);
const view = (line: readonly Uci[], ply = line.length) =>
  lessonView({ lesson: BERLIN, line, ply, opponent: 1500 });
const cueAt = (line: readonly Uci[], ply = line.length) => view(line, ply).cue!;

/** `san` played at `key`, in UCI; it throws where the move is illegal. */
function played(key: string, san: string): Uci {
  const uci = sanToUci(readPositionKey(key)!, san);
  if (!uci) throw new Error(`Illegal move ${san}`);
  return uci;
}

describe('lineCue', () => {
  it("finds the other side's marked mistake, without a note to name it", () => {
    const cue = cueAt(moves(9));
    expect(cue).toMatchObject({ ply: 9, line: uciLine(...LINE).slice(8), followed: 1 });
    expect(cue.key).toBe(lineKeys(moves(9))[9]);
    expect(cue.before).toBe(lineKeys(moves(9))[8]);
  });

  it('counts the moves the game plays along its line', () => {
    expect(cueAt(moves(12)).followed).toBe(4);
    const offLine = [...moves(9), played(cueAt(moves(9)).key, 'a6')];
    expect(cueAt(offLine).followed).toBe(1);
  });

  it("finds the line's reply or a book move, and misses any other", () => {
    expect(cueAt(moves(9))).toMatchObject({ tried: undefined, found: false });
    expect(cueAt(moves(10))).toMatchObject({ tried: moves(10)[9], found: true });
    // Shown at the cue, the game's move after it still counts.
    expect(cueAt(moves(10), 9)).toMatchObject({ found: true });
    const key = cueAt(moves(9)).key;
    expect(cueAt([...moves(9), played(key, 'a6')])).toMatchObject({ found: false });
    const booked: Lesson = {
      ...BERLIN,
      positions: {
        ...BERLIN.positions,
        [key]: {
          ...BERLIN.positions[key],
          moves: [...BERLIN.positions[key].moves, { uci: played(key, 'a6'), book: true }],
        },
      },
    };
    const line = [...moves(9), played(key, 'a6')];
    expect(lessonView({ lesson: booked, line, ply: 10, opponent: 1500 }).cue?.found).toBe(true);
  });

  it('is none before the mistake is on the board, nor for a mark of the learner’s side', () => {
    expect(view(moves(12), 8).cue).toBeUndefined();
    const asWhite: Lesson = { ...BERLIN, side: 'white' };
    const line = moves(9);
    expect(lessonView({ lesson: asWhite, line, ply: 9, opponent: 1500 }).cue).toBeUndefined();
  });
});

describe('payoffAt', () => {
  const cue = cueAt(moves(12));

  it('is ahead at the cue, played through the line, done at its end', () => {
    expect(payoffAt(cue, 9)).toBe('ahead');
    expect(payoffAt(cue, 10)).toBe('playing');
    expect(payoffAt(cue, 11)).toBe('playing');
    expect(payoffAt(cue, 12)).toBe('done');
  });

  it('is none for a line that ends at the reply', () => {
    expect(payoffAt({ ...cue, line: cue.line.slice(0, 2) }, 10)).toBe('none');
  });
});

describe('every shipped cue', () => {
  // Each mark of the side the learner doesn't play, in every shipped lesson.
  const cues = shippedIds.flatMap((id) => {
    const lesson = readShippedLesson(id);
    return Object.entries(lesson.positions).flatMap(([key, { moves }]) =>
      readPositionKey(key)!.turn === lesson.side
        ? []
        : moves.filter(({ mistake }) => mistake).map((move) => ({ id, lesson, key, move })),
    );
  });

  it('finds them', () => {
    expect(cues.length).toBeGreaterThan(100);
  });

  it("finds the line's reply, and the payoff's opponent plays the line", () => {
    for (const { id, lesson, key, move } of cues) {
      const line = mistakeLine(lesson, key, move);
      const keys = Array.from(playLine(line, readPositionKey(key)!), (step) => step.key);
      const cue = lineCue(lesson, line, keys, [move], 1)!;
      expect([id, cue.line, cue.found]).toEqual([id, line, true]);
      const choose = payoffReplies(cue);
      line.forEach((uci, n) => {
        if (n === 0 || readPositionKey(keys[n])!.turn === lesson.side) return;
        const replies = candidates(lesson, keys[n], undefined);
        expect([id, n, choose(replies, keys[n])?.move.uci]).toEqual([id, n, uci]);
      });
    }
  });
});
