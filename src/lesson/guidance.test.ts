import { describe, expect, it } from '@jest/globals';

import {
  guidance,
  type Guidance,
  type GuidanceInput,
  type LessonMode,
  type LessonSwitches,
  notePlayback,
  type ShownIdea,
} from './guidance';
import type { Idea } from './lesson';
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
        notes: ['move', 'position'],
        best: undefined,
      });
    });

    it("shows, right after the learner's move, its notes and then those of the position it was played in", () => {
      const notes = shown([...ADVANCE, 'Bf5'], 'practice').notes;
      expect(notes.map(({ note, after }) => [note.ideas?.map(({ type }) => type), after])).toEqual([
        [['plan'], keyAfter(...ADVANCE, 'Bf5')],
        [['structure', 'structure'], keyAfter(...ADVANCE)],
      ]);
    });

    it('lets only the notes about the position on the board be pointed at', () => {
      // The second note is about the position the move was played in.
      const practice = shown([...ADVANCE, 'Bf5'], 'practice');
      expect(practice.pointable).toEqual([practice.notes[0].note]);
      // Pointing at the other leaves the board as it is.
      const view = sampleView(ADVANCE);
      const [, position] = view.notes;
      const elsewhere = { ...view, notes: [{ ...position, after: keyAfter('e4') }] };
      const pointing = guidance({
        view: elsewhere,
        mode: 'explore',
        switches: ALL_ON,
        engine: ENGINE,
        pointed: position.note,
      });
      expect(pointing.drawnCandidates).toEqual(pointing.candidates);
      expect(pointing.best).toBe('g8f6');
    });

    it("hides the position's own notes on the learner's turn, but not a trap's warning with traps shown", () => {
      // The trap's note as a note about the position, where the importer now puts such notes.
      const view = sampleView(TRAP);
      const own = { ...view, notes: view.notes.map(({ note, after }) => ({ note, after })) };
      const practice = (showTraps: boolean) =>
        guidance({ view: own, mode: 'practice', switches: { ...ALL_ON, showTraps } }).notes;
      expect(practice(true)).toHaveLength(1);
      expect(practice(false)).toEqual([]);
      expect(summary(shown(ADVANCE, 'practice')).notes).toEqual(['move']);
    });

    it('draws the ideas of the move played, whatever "show ideas on board" says', () => {
      expect(shown(ADVANCE, 'practice', { showIdeas: false }).ideas).toHaveLength(2);
    });
  });

  describe('what the board draws', () => {
    const explore = (sans: string[], input: Partial<GuidanceInput> = {}) =>
      guidance({
        view: sampleView(sans),
        mode: 'explore',
        switches: ALL_ON,
        engine: ENGINE,
        ...input,
      });
    const types = (ideas: readonly ShownIdea[]) => ideas.map(({ idea }) => idea.type);

    it('draws the candidates without the ideas, until a note is pointed at', () => {
      const plain = explore(ADVANCE);
      expect(plain.drawnCandidates).toEqual(plain.candidates);
      expect(plain.drawn).toEqual([]);
      const [, position] = plain.notes;
      const pointing = explore(ADVANCE, { pointed: position.note });
      expect(pointing.drawnCandidates).toEqual([]);
      expect(types(pointing.drawn)).toEqual(['structure', 'structure']);
    });

    it('lets only notes whose ideas draw be pointed at, as the switches allow', () => {
      const [move, position] = explore(ADVANCE).notes;
      expect(explore(ADVANCE).pointable).toEqual([move.note, position.note]);
      expect(explore(ADVANCE, { switches: { ...ALL_ON, showIdeas: false } }).pointable).toEqual([]);
    });

    it('names the pointed note only while its ideas draw, and not during a playback', () => {
      const [, position] = explore(ADVANCE).notes;
      expect(explore(ADVANCE, { pointed: position.note }).pointed).toBe(position.note);
      const off = { ...ALL_ON, showIdeas: false };
      expect(explore(ADVANCE, { pointed: position.note, switches: off }).pointed).toBeUndefined();
      const [trap] = explore(TRAP).notes;
      expect(explore(TRAP, { pointed: trap.note }).pointed).toBe(trap.note);
      expect(explore(TRAP, { pointed: trap.note, playing: trap.note }).pointed).toBeUndefined();
    });

    it("hides Stockfish's best move while a note is pointed at", () => {
      const [, position] = explore(ADVANCE).notes;
      expect(explore(ADVANCE, { pointed: position.note }).best).toBeUndefined();
    });

    it("hides Stockfish's best move while a move is previewed", () => {
      expect(explore(ADVANCE).best).toBe('g8f6');
      const previewing = preview(SAMPLE, sampleView(ADVANCE), { at: 'row', uci: 'c8f5' });
      expect(explore(ADVANCE, { preview: previewing }).best).toBeUndefined();
    });

    it('leaves the board as it is for a note with nothing to draw', () => {
      const text = { text: 'Just words.' };
      const view = sampleView(ADVANCE);
      const withText = { ...view, notes: [...view.notes, { note: text, after: view.key }] };
      const pointing = guidance({
        view: withText,
        mode: 'explore',
        switches: ALL_ON,
        pointed: text,
      });
      expect(pointing.drawnCandidates).toHaveLength(2);
    });

    it("draws a sliding preview's ideas in place of the candidates", () => {
      const view = sampleView(ADVANCE);
      const previewing = preview(SAMPLE, view, { at: 'row', uci: 'c8f5' });
      const shownPreview = explore(ADVANCE, { preview: previewing });
      expect(shownPreview.drawnCandidates).toEqual([]);
      expect(types(shownPreview.drawn)).toEqual(['plan']);
    });

    it('draws every idea where no candidates are drawn', () => {
      const end = [...ADVANCE, 'Bf5', 'Nf3', 'e6', 'Be2', 'c5', 'O-O', 'Nc6'];
      expect(types(explore(end).drawn).length).toBeGreaterThan(0);
    });

    it('draws only the first of several plans, whose numbers would run together', () => {
      const plan = (from: string): Idea => ({
        type: 'plan',
        side: 'black',
        routes: [{ from: from as never, to: 'a6' }],
      });
      const view = sampleView([...ADVANCE, 'a6']);
      const note = { text: 'Two plans.', ideas: [plan('a7'), plan('b7')] };
      const two = { ...view, notes: [{ note, after: view.key }] };
      const drawn = guidance({ view: two, mode: 'explore', switches: ALL_ON }).drawn;
      expect(drawn.map(({ idea }) => idea)).toEqual([plan('a7')]);
    });

    it("keeps each position's first plan: one on another position doesn't hide it", () => {
      const plan = (from: string): Idea => ({
        type: 'plan',
        side: 'black',
        routes: [{ from: from as never, to: 'a6' }],
      });
      const view = sampleView([...ADVANCE, 'a6']);
      const before = keyAfter(...ADVANCE);
      const notes = [
        { note: { text: 'Earlier.', ideas: [plan('b7')] }, after: before },
        { note: { text: 'Here.', ideas: [plan('a7')] }, after: view.key },
      ];
      const drawn = guidance({ view: { ...view, notes }, mode: 'explore', switches: ALL_ON }).drawn;
      expect(drawn.map(({ at }) => at)).toEqual([before, view.key]);
    });

    it('draws nothing while a note plays back, and names the idea playing', () => {
      const view = sampleView(TRAP);
      const [trap] = view.notes;
      const playing = guidance({
        view,
        mode: 'explore',
        switches: ALL_ON,
        engine: { best: 'a2a3' },
        playing: trap.note,
      });
      expect(playing.playing?.idea.type).toBe('trap');
      expect(playing.drawn).toEqual([]);
      expect(playing.drawnCandidates).toEqual([]);
      expect(playing.best).toBeUndefined();
    });
  });

  describe('notePlayback', () => {
    it("plays a note's trap back while traps are shown, and not otherwise", () => {
      const view = sampleView(TRAP);
      const [trap] = view.notes;
      const ideas = (showTraps: boolean) =>
        guidance({ view, mode: 'explore', switches: { ...ALL_ON, showTraps } }).ideas;
      expect(notePlayback(ideas(true), trap.note)?.idea.type).toBe('trap');
      expect(notePlayback(ideas(false), trap.note)).toBeUndefined();
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
