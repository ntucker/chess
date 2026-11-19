import { describe, expect, it } from '@jest/globals';

import { guidance, type Guidance, type LessonMode, type LessonSwitches } from './guidance';
import { ADVANCE, keyAfter, MAIN, SAMPLE, sampleView, TRAP, TRAP_PUNISHED } from './lesson.fixture';
import { type Pointer, preview } from './view';

const ALL_ON: LessonSwitches = { auto: true, showIdeas: true, showTraps: true };
const ENGINE = { best: 'g8f6', top: ['g8f6', 'c8f5', 'c6c5'] };

function shown(
  sans: string[],
  mode: LessonMode,
  switches: Partial<LessonSwitches> = {},
  {
    pointer,
    engine = ENGINE,
  }: { pointer?: Pointer; engine?: typeof ENGINE | { best: string } } = {},
): Guidance {
  const view = sampleView(sans);
  return guidance({
    view,
    mode,
    switches: { ...ALL_ON, ...switches },
    preview: pointer && preview(SAMPLE, view, pointer),
    engine,
  });
}

/** What a guidance shows, in words: candidates by SAN, notes by kind, ideas by type. */
const summary = (shown: Guidance) => ({
  candidates: shown.candidates.map(({ san }) => san),
  preview: shown.preview?.candidate.san,
  notes: shown.notes.map(({ before }) => (before ? 'move' : 'position')),
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

    it('draws each idea in the position it is checked in', () => {
      // The position after ...c5 has its own note: the pawn on d4 attacks c5.
      const attack = shown([...ADVANCE, 'c5'], 'explore').ideas.find(({ idea }) => idea.type === 'purpose');
      expect(attack).toMatchObject({ idea: { from: 'd4' }, at: keyAfter(...ADVANCE, 'c5') });
      const ideas = shown(ADVANCE, 'explore').ideas;
      expect(ideas.map(({ at }) => at)).toEqual(ideas.map(() => keyAfter(...ADVANCE)));
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

    it("shows the opponent's candidates and previews on I choose, but not Stockfish's moves", () => {
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
      expect(summary(shown([...ADVANCE, 'a6'], 'practice', { auto: false }))).toMatchObject({
        best: undefined,
        top: [],
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

    it('shows a trap fallen into, with "show traps" on or off', () => {
      for (const showTraps of [true, false]) {
        expect(shown(TRAP_PUNISHED, 'practice', { showTraps }).trap).toMatchObject({
          ply: TRAP.length,
        });
      }
    });
  });
});
