import { describe, expect, it } from '@jest/globals';

import type { FinalAnalysis } from '@/evaluation/evaluation';
import { playLine, readPositionKey, sanToUci } from '@/game/replay';
import type { Lesson, Uci } from '@/lesson/lesson';
import { readShippedLesson, shippedIds, uciLine } from '@/lesson/lesson.fixture';
import { mistakeLine } from '@/lesson/mistakes';
import { candidates, lineKeys } from '@/lesson/select';
import { lessonView } from '@/lesson/view';

import { type CueAnalyses, cueActs, lineCue, payoffReplies, tryVerdict } from './cue';

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

/** A final analysis of the position `key`: (SAN, White's expected score), best first. */
function final(key: string, lines: [string, number][]): FinalAnalysis {
  return {
    lines: lines.map(([san, score]) => ({
      uci: played(key, san),
      evaluation: { score, pawns: 0 },
    })),
    depth: 18,
    final: true,
  };
}

const NONE: CueAnalyses = { beforeFailed: false, cueFailed: false };

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

  it('is none before the mistake is on the board, nor for a mark of the learner’s side', () => {
    expect(view(moves(12), 8).cue).toBeUndefined();
    const asWhite: Lesson = { ...BERLIN, side: 'white' };
    const line = moves(9);
    expect(lessonView({ lesson: asWhite, line, ply: 9, opponent: 1500 }).cue).toBeUndefined();
  });
});

describe('tryVerdict', () => {
  const cue = cueAt(moves(9));
  const reply = (san: string) => played(cue.key, san);
  // Black's expected score: 0.45 before the mistake, 0.75 after 5...c6.
  const before = final(cue.before, [['O-O', 0.55]]);
  const after = final(cue.key, [
    ['c6', 0.25],
    ['Nc6', 0.3],
    ['Ng6', 0.5],
  ]);

  it("passes the line's own reply, with no search", () => {
    expect(tryVerdict(BERLIN, cue, reply('c6'), NONE)).toBe('passed');
  });

  it("passes the cue's best, and fails a move it doesn't list, from its analysis alone", () => {
    const first = final(cue.key, [['Nc6', 0.3]]);
    expect(tryVerdict(BERLIN, cue, reply('Nc6'), { ...NONE, cue: first })).toBe('passed');
    expect(tryVerdict(BERLIN, cue, reply('a6'), { ...NONE, cue: after })).toBe('failed');
  });

  it('waits for the position before the mistake to judge a listed move after the first', () => {
    expect(tryVerdict(BERLIN, cue, reply('Nc6'), { ...NONE, cue: after })).toBe('pending');
    expect(tryVerdict(BERLIN, cue, reply('Nc6'), { ...NONE, cue: after, before })).toBe('passed');
    // Listed, but it gives back what the mistake gave away.
    expect(tryVerdict(BERLIN, cue, reply('Ng6'), { ...NONE, cue: after, before })).toBe('failed');
  });

  it('waits for the cue, and is unchecked where a search it needs gave up', () => {
    expect(tryVerdict(BERLIN, cue, reply('a6'), NONE)).toBe('pending');
    expect(tryVerdict(BERLIN, cue, reply('a6'), { ...NONE, cueFailed: true })).toBe('unchecked');
    expect(tryVerdict(BERLIN, cue, reply('Nc6'), { ...NONE, cue: after, beforeFailed: true })).toBe(
      'unchecked',
    );
  });
});

describe('cueActs', () => {
  const cue = cueAt(moves(9));
  const input = { cue, learnerToMove: true };
  const wrong = [...moves(9), played(cue.key, 'a6')];

  it('asks at the cue, with the payoff to come', () => {
    expect(cueActs({ ...input, moves: moves(9), ply: 9 })).toMatchObject({
      found: 'open',
      payoff: 'ahead',
      live: true,
      held: false,
    });
    expect(cueActs({ ...input, moves: moves(9), ply: 9, choice: 'shown' })).toMatchObject({
      found: 'shown',
      live: true,
    });
  });

  it('holds the opponent at a try that has not passed, at the latest move only', () => {
    const tried = { ...input, moves: wrong, learnerToMove: false };
    expect(cueActs({ ...tried, ply: 10, verdict: 'failed' })).toMatchObject({
      found: 'failed',
      live: false,
      held: true,
    });
    expect(cueActs({ ...tried, ply: 10, verdict: 'pending' })?.held).toBe(true);
    // Stepped back to the cue, it asks again, and nothing is held.
    expect(cueActs({ ...input, moves: wrong, ply: 9, verdict: 'failed' })).toMatchObject({
      found: 'open',
      live: true,
      held: false,
    });
  });

  it('plays the payoff once the line’s reply passes, to its end', () => {
    const played = cueAt(moves(10));
    const at = (count: number, learnerToMove: boolean) =>
      cueActs({
        cue: cueAt(moves(count)),
        moves: moves(count),
        ply: count,
        verdict: 'passed',
        learnerToMove,
      });
    expect(
      cueActs({ ...input, cue: played, moves: moves(10), ply: 10, verdict: 'passed' }),
    ).toMatchObject({ found: 'passed', payoff: 'playing', live: false, held: false });
    expect(at(12, false)).toMatchObject({ payoff: 'done' });
    // Back at the cue with the reply played after it: an ordinary position.
    expect(
      cueActs({ ...input, cue: played, moves: moves(10), ply: 9, verdict: 'passed' }),
    ).toMatchObject({ found: 'passed', live: false });
  });

  it('has none once skipped, nor past the line', () => {
    expect(cueActs({ ...input, moves: moves(9), ply: 9, choice: 'skipped' })).toBeUndefined();
    const left = [...wrong, uciLine(...SETUP, 'Nxe5', 'a6', 'Nf3').at(-1)!];
    expect(
      cueActs({ ...input, cue: cueAt(left), moves: left, ply: 11, verdict: 'failed' }),
    ).toBeUndefined();
  });

  it('has no payoff for an accepted reply other than the line’s', () => {
    const other = [...moves(9), played(cue.key, 'Nc6')];
    expect(
      cueActs({ ...input, cue: cueAt(other), moves: other, ply: 10, verdict: 'passed' }),
    ).toMatchObject({ found: 'passed', payoff: 'none' });
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

  it("passes the line's reply at once, and the payoff's opponent plays the line", () => {
    for (const { id, lesson, key, move } of cues) {
      const line = mistakeLine(lesson, key, move);
      const keys = Array.from(playLine(line, readPositionKey(key)!), (step) => step.key);
      const cue = lineCue(lesson, line, keys, [move], 1)!;
      expect([id, cue.line]).toEqual([id, line]);
      expect([id, tryVerdict(lesson, cue, line[1], NONE)]).toEqual([id, 'passed']);
      const choose = payoffReplies(cue);
      line.forEach((uci, n) => {
        if (n === 0 || readPositionKey(keys[n])!.turn === lesson.side) return;
        const replies = candidates(lesson, keys[n], undefined);
        expect([id, n, choose(replies, keys[n])?.move.uci]).toEqual([id, n, uci]);
      });
    }
  });
});
