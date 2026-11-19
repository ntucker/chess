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
import type { Candidate } from './select';
import {
  ADVANCE,
  keyAfter,
  MAIN,
  SAMPLE,
  sampleView,
  TRAP,
  TRAP_PUNISHED,
  uciLine,
  WITH_RARE,
  withTrapMoves,
} from './lesson.fixture';
import { lessonView, type Pointer, preview } from './view';

/** The trap the sample sets, fallen into: the tempting move and the punishing reply. */
const LANDED = [...TRAP, 'Nxe5', 'Nxe5'];
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

    it("shows the opponent's candidates with auto play on and off", () => {
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

    it("shows the opponent's candidates and previews with auto play off, but not Stockfish's moves", () => {
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

    it("keeps a hidden trap's note off the card after its tempting move, and once it lands", () => {
      // The trap's note as a note about the position the tempting move was played in.
      const [trap] = sampleView(TRAP).notes;
      const view = {
        ...sampleView([...TRAP, 'Nxe5']),
        playedFrom: [{ note: trap.note, after: trap.after }],
      };
      const practice = (showTraps: boolean) =>
        guidance({ view, mode: 'practice', switches: { ...ALL_ON, showTraps } }).notes;
      expect(practice(true).map(({ note }) => note)).toContain(trap.note);
      expect(practice(false).map(({ note }) => note)).not.toContain(trap.note);
    });

    it("keeps a hidden trap's note off the card after the learner's move, on the position or the move", () => {
      const [trap] = sampleView(TRAP).notes;
      const after = sampleView([...TRAP, 'Nxe5']);
      for (const notes of [[{ note: trap.note, after: after.key }], [trap]]) {
        const practice = (showTraps: boolean) =>
          guidance({
            view: { ...after, notes },
            mode: 'practice',
            switches: { ...ALL_ON, showTraps },
          }).notes;
        expect(practice(true).map(({ note }) => note)).toContain(trap.note);
        expect(practice(false).map(({ note }) => note)).not.toContain(trap.note);
      }
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

    it('keeps a previewed reply\'s next position notes off the card with auto play off, as on the learner\'s turn', () => {
      const previewed = (mode: LessonMode, uci: string) =>
        summary(shown(MAIN, mode, { auto: false }, { pointer: { at: 'row', uci } })).notes;
      const replies = ['e4e5', 'e4d5', 'b1c3', 'b1d2'];
      expect(replies.flatMap((uci) => previewed('explore', uci))).toContain('position');
      expect(replies.flatMap((uci) => previewed('practice', uci))).not.toContain('position');
    });

    it('keeps a hidden trap\'s warning off a previewed reply with auto play off', () => {
      const pointer: Pointer = { at: 'row', uci: 'c2c3' };
      const traps = (showTraps: boolean) =>
        shown(TRAP.slice(0, -1), 'practice', { auto: false, showTraps }, { pointer }).notes.filter(
          ({ note }) => note.ideas?.some(({ type }) => type === 'trap'),
        );
      expect(traps(true)).toHaveLength(1);
      expect(traps(false)).toEqual([]);
    });

    it("keeps a hidden trap's warning off the card on the learner's turn when it is on the move into it", () => {
      const notes = (showTraps: boolean) =>
        shown(TRAP, 'practice', { showTraps }).notes.filter(({ note }) =>
          note.ideas?.some(({ type }) => type === 'trap'),
        );
      expect(notes(true)).toHaveLength(1);
      expect(notes(false)).toEqual([]);
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

    it.each([
      ['a text note', { text: 'Just words.' }],
      [
        'a material imbalance',
        { text: 'A piece for a pawn.', ideas: [{ type: 'imbalance', side: 'white', kind: 'material' }] },
      ],
    ] as const)('leaves the board as it is for %s, which draws nothing', (_, note) => {
      const view = sampleView(ADVANCE);
      const withNote = { ...view, notes: [...view.notes, { note, after: view.key }] };
      const pointing = guidance({ view: withNote, mode: 'explore', switches: ALL_ON, pointed: note });
      expect(pointing.pointable).not.toContain(note);
      expect(pointing.drawnCandidates).toHaveLength(2);
    });

    it("draws a sliding preview's ideas in place of the candidates", () => {
      const view = sampleView(ADVANCE);
      const previewing = preview(SAMPLE, view, { at: 'row', uci: 'c8f5' });
      const shownPreview = explore(ADVANCE, { preview: previewing });
      expect(shownPreview.drawnCandidates).toEqual([]);
      expect(types(shownPreview.drawn)).toEqual(['plan']);
    });

    it('leaves rare moves off the list and the board until one is previewed', () => {
      const view = sampleView(MAIN, { lesson: WITH_RARE });
      const sans = (candidates: readonly Candidate[]) => candidates.map(({ san }) => san);
      const resting = guidance({ view, mode: 'explore', switches: ALL_ON });
      expect(sans(resting.candidates)).toEqual(['e5', 'exd5', 'Nc3', 'Nd2', 'f3']);
      expect(sans(resting.drawnCandidates)).toEqual(['e5', 'exd5', 'Nc3', 'Nd2', 'f3']);
      expect(sans(resting.rare)).toEqual(['h3', 'a3', 'g3', 'b3']);
      const onPawn = preview(WITH_RARE, view, { at: 'square', square: 'h2' });
      const pointing = guidance({ view, mode: 'explore', switches: ALL_ON, preview: onPawn });
      expect(sans(pointing.drawnCandidates)).toEqual(['h3']);
    });

    it("doesn't tag a rare move as Stockfish's best", () => {
      const view = sampleView(MAIN, { lesson: WITH_RARE });
      const shown = guidance({ view, mode: 'explore', switches: ALL_ON, engine: { best: 'h2h3' } });
      expect(shown.best).toBeUndefined();
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

  describe('lineEnded', () => {
    it("tells of a guide line's end there, and at the learner's turn right after it", () => {
      const end = [...ADVANCE, 'Bf5', 'Nf3', 'e6', 'Be2', 'c5', 'O-O', 'Nc6'];
      expect(shown(end.slice(0, -1), 'practice').lineEnded).toBe(false);
      expect(shown(end, 'practice').lineEnded).toBe(true);
      expect(shown([...end, 'h3'], 'practice').lineEnded).toBe(true);
      expect(shown([...end, 'h3', 'a6'], 'practice').lineEnded).toBe(false);
    });
  });

  describe('notePlayback', () => {
    it("plays a note's trap back while traps are shown, and not otherwise", () => {
      const view = sampleView(TRAP);
      const [trap] = view.notes;
      const playable = (showTraps: boolean) =>
        guidance({ view, mode: 'explore', switches: { ...ALL_ON, showTraps } }).playable;
      expect(notePlayback(playable(true), trap.note)?.idea.type).toBe('trap');
      expect(notePlayback(playable(false), trap.note)).toBeUndefined();
    });

    it('plays a trap fallen into back with traps hidden, from before its tempting move', () => {
      const { playable, trap } = shown(LANDED, 'practice', { showTraps: false });
      expect(notePlayback(playable, trap!.note.note)).toEqual({
        idea: trap!.trap,
        at: keyAfter(...TRAP),
      });
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
        expect(shown(LANDED, 'practice', { showTraps }).trap).toMatchObject({ ply: TRAP.length });
      }
    });

    it('shows a trap fallen into through its moves and the learner\'s turn after them, until the line leaves it', () => {
      expect(shown(TRAP_PUNISHED, 'explore').trap).toMatchObject({ ply: TRAP.length });
      expect(shown([...TRAP_PUNISHED, 'a6'], 'explore').trap).toBeUndefined();
      // A move off the trap's sequence takes the card away before its last move.
      expect(shown([...LANDED, 'Bxd1'], 'explore').trap).toBeDefined();
      expect(shown([...LANDED, 'Qc7'], 'explore').trap).toBeUndefined();
      // So does the opponent's, even with the learner to move.
      expect(shown([...LANDED, 'Bxd1', 'Kxd1'], 'explore').trap).toBeUndefined();
      // Cut to end on the learner's move, the trap stays through the opponent's reply.
      const { moves } = sampleView(LANDED).trap!.trap;
      const lesson = withTrapMoves(SAMPLE, moves, moves.slice(0, -1));
      const trapAt = (sans: string[]) => {
        const line = uciLine(...sans);
        const view = lessonView({ lesson, line, ply: line.length, opponent: 1500 });
        return guidance({ view, mode: 'explore', switches: ALL_ON }).trap;
      };
      expect(trapAt(TRAP_PUNISHED.slice(0, -1))).toBeDefined();
      expect(trapAt(TRAP_PUNISHED)).toBeDefined();
      expect(trapAt([...TRAP_PUNISHED, 'a6'])).toBeUndefined();
    });
  });
});
