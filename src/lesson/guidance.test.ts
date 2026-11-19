import { describe, expect, it } from '@jest/globals';

import { guidance, type Guidance, type LessonMode, type LessonSwitches } from './guidance';
import { MAIN, SAMPLE, uciLine } from './sample.fixture';
import { lessonView, type LessonViewInput } from './view';

const ALL_ON: LessonSwitches = { auto: true, showIdeas: true, showTraps: true };
const ADVANCE = [...MAIN, 'e5'];
const TRAP = [...ADVANCE, 'c5', 'dxc5', 'Nc6', 'Nf3', 'Bg4', 'c3'];
const ENGINE = { best: 'g8f6', top: ['g8f6', 'c8f5', 'c6c5'] };

function shown(
  sans: string[],
  mode: LessonMode,
  switches: Partial<LessonSwitches> = {},
  input: Partial<LessonViewInput> = {},
): Guidance {
  const line = uciLine(...sans);
  const view = lessonView({
    lesson: SAMPLE,
    line,
    ply: line.length,
    opponent: 1500,
    engine: ENGINE,
    ...input,
  });
  return guidance(view, mode, { ...ALL_ON, ...switches });
}

/** What a guidance shows, in words: candidates by SAN, notes by kind, ideas by type. */
const summary = (shown: Guidance) => ({
  candidates: shown.candidates.map(({ san }) => san),
  preview: shown.preview?.candidate.san,
  notes: shown.notes.map(({ on }) => on),
  ideas: shown.ideas.map(({ idea }) => idea.type),
  best: shown.best,
  top: shown.top,
});

describe('guidance', () => {
  describe('Explore', () => {
    it("shows everything on the learner's turn; Stockfish's best is tagged only when the guide lacks it", () => {
      expect(summary(shown(ADVANCE, 'explore'))).toEqual({
        candidates: ['Bf5', 'c5'],
        preview: undefined,
        notes: ['move', 'position'],
        ideas: ['purpose', 'imbalance', 'structure', 'structure'],
        best: 'g8f6',
        top: [],
      });
      expect(shown(ADVANCE, 'explore', {}, { engine: { best: 'c8f5' } }).best).toBeUndefined();
    });

    it("shows the opponent's candidates on Auto and on I choose", () => {
      expect(shown(MAIN, 'explore', { auto: true }).candidates).toHaveLength(4);
      expect(shown(MAIN, 'explore', { auto: false }).candidates).toHaveLength(4);
    });

    it('keeps the notes but draws no ideas with "show ideas on board" off', () => {
      const off = shown(ADVANCE, 'explore', { showIdeas: false });
      expect(off.notes).toHaveLength(2);
      expect(off.ideas).toEqual([]);
    });

    it("shows a previewed move's notes and ideas in place of the position's", () => {
      const previewing = shown(ADVANCE, 'explore', {}, { pointer: { at: 'row', uci: 'c8f5' } });
      expect(summary(previewing)).toMatchObject({
        preview: 'Bf5',
        notes: ['move'],
        ideas: ['plan'],
      });
    });

    it("highlights Stockfish's best and lists its top three beyond the guide, and at a guide end", () => {
      expect(shown([...ADVANCE, 'a6'], 'explore')).toMatchObject({
        candidates: [],
        best: 'g8f6',
        top: ENGINE.top,
      });
      const end = [...ADVANCE, 'Bf5', 'Nf3', 'e6', 'Be2', 'c5', 'O-O', 'Nc6'];
      expect(shown(end, 'explore')).toMatchObject({ best: 'g8f6', top: ENGINE.top });
    });

    it('gives each idea the positions around its note', () => {
      const [first] = shown(ADVANCE, 'explore').ideas;
      const keys = lessonView({
        lesson: SAMPLE,
        line: uciLine(...ADVANCE),
        ply: 5,
        opponent: 1500,
      });
      expect(first.after).toBe(keys.key);
      expect(first.before).not.toBe(keys.key);
    });
  });

  describe('Practice', () => {
    it("hides every hint on the learner's turn, keeping only the move just played", () => {
      const learner = shown(ADVANCE, 'practice', {}, { pointer: { at: 'row', uci: 'c8f5' } });
      expect(summary(learner)).toEqual({
        candidates: [],
        preview: undefined,
        notes: ['move'],
        ideas: ['purpose', 'imbalance'],
        best: undefined,
        top: [],
      });
      expect(summary(shown([...ADVANCE, 'a6', 'Nf3'], 'practice'))).toMatchObject({
        best: undefined,
        top: [],
      });
    });

    it("shows the opponent's candidates and previews on I choose", () => {
      const choosing = shown(
        MAIN,
        'practice',
        { auto: false },
        { pointer: { at: 'row', uci: 'b1c3' } },
      );
      expect(summary(choosing)).toMatchObject({
        candidates: ['e5', 'exd5', 'Nc3', 'Nd2'],
        preview: 'Nc3',
      });
    });

    it("hides the opponent's candidates on Auto, but not the notes", () => {
      const auto = shown(
        [...ADVANCE, 'Bf5'],
        'practice',
        { auto: true },
        { pointer: { at: 'row', uci: 'g1f3' } },
      );
      expect(summary(auto)).toMatchObject({
        candidates: [],
        preview: undefined,
        notes: ['move'],
        best: undefined,
      });
    });

    it('draws the ideas of the move played, whatever "show ideas on board" says', () => {
      expect(shown(ADVANCE, 'practice', { showIdeas: false }).ideas).toHaveLength(2);
    });
  });

  describe('traps', () => {
    it('draws a trap before the learner commits only with "show traps" on', () => {
      for (const mode of ['explore', 'practice'] as const) {
        expect(shown(TRAP, mode, { showTraps: true }).ideas.map(({ idea }) => idea.type)).toContain(
          'trap',
        );
        expect(
          shown(TRAP, mode, { showTraps: false }).ideas.map(({ idea }) => idea.type),
        ).not.toContain('trap');
      }
    });

    it('shows a trap walked into once its punishment is on the board', () => {
      expect(shown([...TRAP, 'Nxe5'], 'practice', { showTraps: false }).trap).toBeUndefined();
      expect(shown([...TRAP, 'Nxe5', 'Nxe5'], 'practice', { showTraps: false }).trap).toMatchObject(
        {
          ply: TRAP.length,
          played: 2,
        },
      );
    });
  });
});
