import { describe, expect, it } from '@jest/globals';

import {
  cueActs,
  guidance,
  type EngineView,
  type Guidance,
  type GuidanceInput,
  type LessonMode,
  type LessonSwitches,
  listedEngineMoves,
  notePlayback,
  type ShownIdea,
  verdictSearch,
} from './guidance';
import type { BoardIdea } from './mistakes';
import { type Candidate, engineCandidates } from './select';
import {
  ADVANCE,
  keyAfter,
  MAIN,
  SAMPLE,
  sampleView,
  TRAP,
  TRAP_PUNISHED,
  uci,
  uciLine,
  viewAfter,
  WITH_RARE,
  withMistakeLine,
  withMoves,
  readShippedLesson,
} from './lesson.fixture';
import { lessonView, type Pointer, preview } from './view';

/** The trap the sample sets, fallen into: the tempting move and the punishing reply. */
const LANDED = [...TRAP, 'Nxe5', 'Nxe5'];
const ALL_ON: LessonSwitches = { auto: true, showMoves: true, showTraps: true };
const ENGINE = { best: 'g8f6', final: true };
const EVEN = { score: 0.5, pawns: 0 };

/** Stockfish's view after `sans`: `best`, and `top` as its top moves' rows there. */
function engineView(
  sans: string[],
  { best, top = [], final }: { best?: string; top?: string[]; final?: boolean },
) {
  const { key } = sampleView(sans);
  const moves = top.map((uci) => ({ uci, evaluation: EVEN }));
  return { best, top: engineCandidates(SAMPLE, key, moves), final };
}

function shown(
  sans: string[],
  mode: LessonMode,
  switches: Partial<LessonSwitches> = {},
  {
    pointer,
    lifted,
    engine = ENGINE,
    picking = sans.length === 0,
    refutation,
  }: {
    pointer?: Pointer;
    lifted?: Candidate['from'];
    engine?: { best?: string; top?: string[]; final?: boolean };
    picking?: boolean;
    refutation?: string;
  } = {},
): Guidance {
  const view = sampleView(sans);
  const stockfish = engineView(sans, engine);
  // As useLesson does: a pointer previews only the rows the list shows.
  const listed = listedEngineMoves(view, mode, picking, stockfish.top, stockfish.final);
  return guidance({
    view,
    mode,
    switches: { ...ALL_ON, ...switches },
    picking,
    preview: pointer && preview(SAMPLE, view, pointer, listed),
    lifted,
    engine: stockfish,
    refutation,
  });
}

/** What a guidance shows, in words: candidates by SAN, notes by kind, ideas by type. */
const summary = (shown: Guidance) => ({
  candidates: shown.candidates.map(({ san }) => san),
  preview: shown.preview?.candidate.san,
  notes: shown.notes.map(({ before }) => (before ? 'move' : 'position')),
  ideas: shown.ideas.map(({ idea }) => idea.type),
  best: shown.best,
  top: shown.top.map(({ san }) => san),
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
      expect(
        shown(ADVANCE, 'explore', {}, { engine: { best: 'c8f5', final: true } }).best,
      ).toBeUndefined();
      // Inside the guide, a move outside it waits for the search to finish.
      expect(shown(ADVANCE, 'explore', {}, { engine: { best: 'g8f6' } }).best).toBeUndefined();
    });

    it("shows the opponent's candidates with auto play on and off", () => {
      expect(shown(MAIN, 'explore', { auto: true }).candidates).toHaveLength(4);
      expect(shown(MAIN, 'explore', { auto: false }).candidates).toHaveLength(4);
    });

    it("shows a previewed move's notes and ideas in place of the position's", () => {
      const previewing = shown(ADVANCE, 'explore', {}, { pointer: { at: 'row', uci: 'c8f5' } });
      expect(summary(previewing)).toMatchObject({
        preview: 'Bf5',
        notes: ['move'],
        ideas: ['plan'],
      });
    });

    it("hands Stockfish's verdicts on the candidates to the list, only in Explore off the picking moves", () => {
      const verdicts = new Map([
        [
          'c8f5',
          { quality: 'good', change: { label: '\u22120.1', description: '' }, loss: 0.01 },
        ] as const,
      ]);
      const at = (sans: string[], mode: LessonMode, engine: EngineView = { verdicts }) =>
        guidance({
          view: sampleView(sans),
          mode,
          switches: ALL_ON,
          picking: sans.length === 0,
          engine,
        }).verdicts;
      expect(at(ADVANCE, 'explore')).toBe(verdicts);
      // None judged yet: the list shows verdicts, and waits for them.
      expect(at(ADVANCE, 'explore', {})).toEqual(new Map());
      expect(at(ADVANCE, 'practice')).toBeUndefined();
      expect(at([], 'explore')).toBeUndefined();
    });

    it("points out the other side's marked mistakes only in Explore, on its turn, off the picking moves", () => {
      // After 1.e4 c6 2.d4 d5 White's 3.e5 is marked; the sample's learner plays Black.
      const marked = withMoves(SAMPLE, keyAfter(...MAIN), (moves) =>
        moves.map((move) => (move.uci === uci(...ADVANCE) ? { ...move, mistake: {} } : move)),
      );
      const at = (sans: string[], mode: LessonMode) => [
        ...guidance({
          view: viewAfter(marked, sans),
          mode,
          switches: ALL_ON,
          picking: sans.length === 0,
        }).opportunities,
      ];
      expect(at(MAIN, 'explore')).toEqual([uci(...ADVANCE)]);
      expect(at(MAIN, 'practice')).toEqual([]);
      expect(at([], 'explore')).toEqual([]);
      // The learner's own marked move is a trap, not an opportunity.
      const learnerMarked = withMoves(SAMPLE, keyAfter(...ADVANCE), (moves) =>
        moves.map((move) => ({ ...move, mistake: {} })),
      );
      const learnerTurn = guidance({
        view: viewAfter(learnerMarked, ADVANCE),
        mode: 'explore',
        switches: ALL_ON,
        picking: false,
      });
      expect([...learnerTurn.opportunities]).toEqual([]);
    });

    it("lists Stockfish's top three beyond the guide, and at a guide end, marking the first as best", () => {
      const beyond = [...ADVANCE, 'a6'];
      // One analysis names the best move and lists the top three.
      const engine = { best: 'g1f3', top: ['g1f3', 'c2c3', 'f1d3'] };
      expect(summary(shown(beyond, 'explore', {}, { engine }))).toMatchObject({
        candidates: [],
        best: 'g1f3',
        top: ['Nf3', 'c3', 'Bd3'],
      });
      const end = [...ADVANCE, 'Bf5', 'Nf3', 'e6', 'Be2', 'c5', 'O-O', 'Nc6'];
      const atEnd = shown(
        end,
        'explore',
        {},
        { engine: { best: 'c2c3', top: ['c2c3', 'c1e3', 'b1d2'] } },
      );
      expect(summary(atEnd)).toMatchObject({ best: 'c2c3', top: ['c3', 'Be3', 'Nbd2'] });
      // Before the analysis arrives, nothing is marked.
      expect(shown(beyond, 'explore', {}, { engine: {} }).best).toBeUndefined();
    });

    it("previews and plays Stockfish's top moves as the guide's candidates", () => {
      const beyond = [...ADVANCE, 'a6'];
      const engine = { top: ['g1f3', 'c2c3', 'f1d3'] };
      const row = shown(beyond, 'explore', {}, { engine, pointer: { at: 'row', uci: 'c2c3' } });
      expect(row.preview).toMatchObject({ slide: true, candidate: { san: 'c3' } });
      expect(row.best).toBeUndefined();
      const drag = shown(
        beyond,
        'explore',
        {},
        {
          engine,
          pointer: { at: 'drag', from: 'f1', to: 'd3' },
        },
      );
      expect(drag.preview).toMatchObject({ slide: false, candidate: { san: 'Bd3' } });
      // A picked-up piece draws its top moves, as it draws its candidates.
      const pickedUp = shown(beyond, 'explore', {}, { engine, lifted: 'f1' });
      expect(pickedUp.drawnCandidates.map(({ san }) => san)).toEqual(['Bd3']);
      expect(pickedUp.best).toBeUndefined();
      // Practice hides them, as every hint.
      const practice = shown(beyond, 'practice', {}, { engine });
      expect(summary(practice)).toMatchObject({ top: [], best: undefined });
    });

    it("lists Stockfish's best after the opponent's candidates when the guide lacks it", () => {
      // After MAIN the guide gives White e5, exd5, Nc3 and Nd2; Stockfish names f3.
      const engine = { best: 'f2f3', top: ['f2f3', 'e4e5', 'b1c3'], final: true };
      expect(summary(shown(MAIN, 'explore', {}, { engine }))).toMatchObject({
        candidates: ['e5', 'exd5', 'Nc3', 'Nd2'],
        best: 'f2f3',
        top: ['f3'],
      });
      // Its row previews, and its piece lights it, as a candidate's does.
      const row = shown(MAIN, 'explore', {}, { engine, pointer: { at: 'row', uci: 'f2f3' } });
      expect(row.preview).toMatchObject({ slide: true, candidate: { san: 'f3' } });
      const pickedUp = shown(MAIN, 'explore', {}, { engine, lifted: 'f2' });
      expect(pickedUp.drawnCandidates.map(({ san }) => san)).toEqual(['f3']);
      // Only the best, once final, when the guide lacks it, on the opponent's turn, in Explore.
      const notFinal = shown(MAIN, 'explore', {}, { engine: { ...engine, final: false } });
      const guides = { best: 'e4e5', top: ['e4e5', 'f2f3'], final: true };
      const learners = { best: 'g8f6', top: ['g8f6', 'c8f5'], final: true };
      expect(notFinal.top).toEqual([]);
      expect(shown(MAIN, 'explore', {}, { engine: guides }).top).toEqual([]);
      expect(shown(ADVANCE, 'explore', {}, { engine: learners }).top).toEqual([]);
      expect(shown(MAIN, 'practice', { auto: false }, { engine }).top).toEqual([]);
      expect(shown(MAIN, 'explore', {}, { engine, picking: true }).top).toEqual([]);
    });

    it('draws each idea in the position it is checked in', () => {
      // The position after ...c5 has its own note: the pawn on d4 attacks c5.
      const attack = shown([...ADVANCE, 'c5'], 'explore').ideas.find(
        ({ idea }) => idea.type === 'purpose',
      );
      expect(attack).toMatchObject({ idea: { from: 'd4' }, at: keyAfter(...ADVANCE, 'c5') });
      const ideas = shown(ADVANCE, 'explore').ideas;
      expect(ideas.map(({ at }) => at)).toEqual(ideas.map(() => keyAfter(...ADVANCE)));
    });
  });

  describe("the reply that punishes the learner's mistake", () => {
    // ...a6 leaves the guide; say it was a mistake that Nf3 punishes.
    const beyond = [...ADVANCE, 'a6'];
    const engine = { best: 'g1f3', top: ['g1f3', 'c2c3', 'f1d3'], final: true };
    const refutation = 'g1f3';

    it('marks it in every mode, with "Arrows" on or off, in place of the best', () => {
      for (const mode of ['explore', 'practice'] as const) {
        for (const showMoves of [true, false]) {
          const marked = shown(beyond, mode, { showMoves }, { engine, refutation });
          expect(marked.refutation).toBe('g1f3');
          expect(marked.best).toBeUndefined();
        }
      }
      // Its row stays listed beside the other top moves.
      expect(shown(beyond, 'explore', {}, { engine, refutation }).top).toHaveLength(3);
    });

    it("never marks the reply to the opponent's mistake: on the learner's turn it would be their move", () => {
      // After ADVANCE it is the learner's turn: say White's e5 was a mistake that ...c5 punishes.
      for (const mode of ['explore', 'practice'] as const) {
        expect(shown(ADVANCE, mode, {}, { refutation: 'c7c5' }).refutation).toBeUndefined();
      }
    });

    it('hides it while a move is previewed or a piece picked up', () => {
      const row = { at: 'row', uci: 'c2c3' } as const;
      expect(shown(beyond, 'explore', {}, { engine, refutation, pointer: row })).toMatchObject({
        refutation: undefined,
        best: undefined,
      });
      expect(
        shown(beyond, 'explore', {}, { engine, refutation, lifted: 'f1' }).refutation,
      ).toBeUndefined();
    });

    it("draws it in place of the guide's arrow for the same move, which stays listed", () => {
      // After MAIN the guide gives White e5, exd5, Nc3 and Nd2.
      const marked = shown(MAIN, 'explore', {}, { refutation: 'e4e5' });
      expect(marked.candidates.map(({ san }) => san)).toEqual(['e5', 'exd5', 'Nc3', 'Nd2']);
      expect(marked.drawnCandidates.map(({ san }) => san)).toEqual(['exd5', 'Nc3', 'Nd2']);
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

    it("hides the opponent's candidates with auto play on, but not the notes", () => {
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

    it('shows the first moves at the start, where they pick the opening, with auto play on', () => {
      const start = shown([], 'practice', { auto: true }, { pointer: { at: 'row', uci: 'e2e4' } });
      expect(summary(start)).toMatchObject({ candidates: ['e4'], preview: 'e4', best: undefined });
    });

    it('shows the moves at a later turn where they still pick the opening, a quiz once picked', () => {
      const picking = shown(['e4'], 'practice', { auto: true }, { picking: true });
      expect(summary(picking).candidates).toEqual(['c6']);
      expect(summary(shown(['e4'], 'practice', { auto: true })).candidates).toEqual([]);
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
        guidance({ picking: false, view, mode: 'practice', switches: { ...ALL_ON, showTraps } })
          .notes;
      expect(practice(true).map(({ note }) => note)).toContain(trap.note);
      expect(practice(false).map(({ note }) => note)).not.toContain(trap.note);
    });

    it("keeps a hidden trap's note off the card after the learner's move, on the position or the move", () => {
      const [trap] = sampleView(TRAP).notes;
      const after = sampleView([...TRAP, 'Nxe5']);
      for (const notes of [[{ note: trap.note, after: after.key }], [trap]]) {
        const practice = (showTraps: boolean) =>
          guidance({
            picking: false,
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
        picking: false,
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
        guidance({
          picking: false,
          view: own,
          mode: 'practice',
          switches: { ...ALL_ON, showTraps },
        }).notes;
      expect(practice(true)).toHaveLength(1);
      expect(practice(false)).toEqual([]);
      expect(summary(shown(ADVANCE, 'practice')).notes).toEqual(['move']);
    });

    it("keeps a previewed reply's next position notes off the card with auto play off, as on the learner's turn", () => {
      const previewed = (mode: LessonMode, uci: string) =>
        summary(shown(MAIN, mode, { auto: false }, { pointer: { at: 'row', uci } })).notes;
      const replies = ['e4e5', 'e4d5', 'b1c3', 'b1d2'];
      expect(replies.flatMap((uci) => previewed('explore', uci))).toContain('position');
      expect(replies.flatMap((uci) => previewed('practice', uci))).not.toContain('position');
    });

    it("keeps a hidden trap's warning off a previewed reply with auto play off", () => {
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
  });

  describe('what the board draws', () => {
    const explore = (sans: string[], input: Partial<GuidanceInput> = {}) =>
      guidance({
        picking: false,
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

    it('keeps the arrows off the resting board with "Arrows" off, until pointed at', () => {
      const off = { ...ALL_ON, showMoves: false };
      const resting = explore(ADVANCE, { switches: off });
      expect(resting.candidates).toEqual(explore(ADVANCE).candidates);
      expect(resting.drawnCandidates).toEqual([]);
      // In the arrows' place, the idea of the move just played (3.e5).
      const [move] = resting.notes;
      expect(resting.drawn.map(({ idea }) => idea)).toEqual(move.note.ideas);
      const previewing = preview(SAMPLE, sampleView(ADVANCE), { at: 'row', uci: 'c8f5' });
      expect(types(explore(ADVANCE, { switches: off, preview: previewing }).drawn)).toEqual([
        'plan',
      ]);
      const dragging = explore(ADVANCE, { switches: off, lifted: 'c8' });
      expect(dragging.drawnCandidates.map(({ move }) => move.uci)).toEqual(['c8f5']);
      const [, position] = resting.notes;
      const pointing = explore(ADVANCE, { switches: off, pointed: position.note });
      expect(pointing.pointed).toBe(position.note);
      expect(types(pointing.drawn)).toEqual(['structure', 'structure']);
    });

    it("draws the learner's move's ideas on the opponent's turn with 'Arrows' off", () => {
      const played = shown([...ADVANCE, 'Bf5'], 'explore', { auto: false, showMoves: false });
      const move = played.notes.find(({ before }) => before !== undefined);
      expect(played.drawnCandidates).toEqual([]);
      expect(played.drawn.map(({ idea }) => idea)).toEqual(move?.note.ideas);
    });

    it("draws Practice's choices whatever 'Arrows' says", () => {
      const line = [...ADVANCE, 'Bf5'];
      const off = shown(line, 'practice', { auto: false, showMoves: false });
      expect(off.drawnCandidates.length).toBeGreaterThan(0);
      expect(off).toEqual(shown(line, 'practice', { auto: false, showMoves: true }));
    });

    it("keeps Stockfish's best off the resting board with 'Arrows' off", () => {
      expect(explore(ADVANCE).best).toBe('g8f6');
      expect(explore(ADVANCE, { switches: { ...ALL_ON, showMoves: false } }).best).toBeUndefined();
    });

    it('lets only notes whose ideas draw be pointed at', () => {
      const [move, position] = explore(ADVANCE).notes;
      expect(explore(ADVANCE).pointable).toEqual([move.note, position.note]);
    });

    it('names the pointed note only while its ideas draw, and not during a playback', () => {
      const [, position] = explore(ADVANCE).notes;
      expect(explore(ADVANCE, { pointed: position.note }).pointed).toBe(position.note);
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
        {
          text: 'A piece for a pawn.',
          ideas: [{ type: 'imbalance', side: 'white', kind: 'material' }],
        },
      ],
    ] as const)('leaves the board as it is for %s, which draws nothing', (_, note) => {
      const view = sampleView(ADVANCE);
      const withNote = { ...view, notes: [...view.notes, { note, after: view.key }] };
      const pointing = guidance({
        picking: false,
        view: withNote,
        mode: 'explore',
        switches: ALL_ON,
        pointed: note,
      });
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

    it('leaves rare moves off the list and the board until one is previewed or dragged', () => {
      const view = sampleView(MAIN, { lesson: WITH_RARE });
      const sans = (candidates: readonly Candidate[]) => candidates.map(({ san }) => san);
      const resting = guidance({ picking: false, view, mode: 'explore', switches: ALL_ON });
      expect(sans(resting.candidates)).toEqual(['e5', 'exd5', 'Nc3', 'Nd2', 'f3']);
      expect(sans(resting.drawnCandidates)).toEqual(['e5', 'exd5', 'Nc3', 'Nd2', 'f3']);
      expect(sans(resting.rare)).toEqual(['h3', 'a3', 'g3', 'b3']);
      // Picked up, the pawn draws its rare move at once, and the same over
      // its landing square, so nothing on the board moves as it is dragged.
      const pickedUp = guidance({
        picking: false,
        view,
        mode: 'explore',
        switches: ALL_ON,
        lifted: 'h2',
      });
      expect(sans(pickedUp.drawnCandidates)).toEqual(['h3']);
      const onH3 = preview(WITH_RARE, view, { at: 'drag', from: 'h2', to: 'h3' });
      const over = guidance({
        picking: false,
        view,
        mode: 'explore',
        switches: ALL_ON,
        preview: onH3,
        lifted: 'h2',
      });
      expect(over.drawnCandidates).toEqual(pickedUp.drawnCandidates);
      expect(over.drawn).toEqual(pickedUp.drawn);
    });

    it("hides a dragged piece's candidates in Practice on the learner's turn", () => {
      const view = sampleView(ADVANCE);
      const shown = guidance({
        picking: false,
        view,
        mode: 'practice',
        switches: ALL_ON,
        lifted: 'c8',
      });
      expect(shown.drawnCandidates).toEqual([]);
    });

    it("doesn't tag a rare move as Stockfish's best", () => {
      const view = sampleView(MAIN, { lesson: WITH_RARE });
      const shown = guidance({
        picking: false,
        view,
        mode: 'explore',
        switches: ALL_ON,
        engine: { best: 'h2h3' },
      });
      expect(shown.best).toBeUndefined();
    });

    it('draws every idea where no candidates are drawn', () => {
      const end = [...ADVANCE, 'Bf5', 'Nf3', 'e6', 'Be2', 'c5', 'O-O', 'Nc6'];
      expect(types(explore(end).drawn).length).toBeGreaterThan(0);
    });

    it('draws only the first of several plans, whose numbers would run together', () => {
      const plan = (from: string): BoardIdea => ({
        type: 'plan',
        side: 'black',
        routes: [{ from: from as never, to: 'a6' }],
      });
      const view = sampleView([...ADVANCE, 'a6']);
      const note = { text: 'Two plans.', ideas: [plan('a7'), plan('b7')] };
      const two = { ...view, notes: [{ note, after: view.key }] };
      const drawn = guidance({
        picking: false,
        view: two,
        mode: 'explore',
        switches: ALL_ON,
      }).drawn;
      expect(drawn.map(({ idea }) => idea)).toEqual([plan('a7')]);
    });

    it("keeps each position's first plan: one on another position doesn't hide it", () => {
      const plan = (from: string): BoardIdea => ({
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
      const drawn = guidance({
        picking: false,
        view: { ...view, notes },
        mode: 'explore',
        switches: ALL_ON,
      }).drawn;
      expect(drawn.map(({ at }) => at)).toEqual([before, view.key]);
    });

    it('draws nothing while a note plays back, and names the idea playing', () => {
      const view = sampleView(TRAP);
      const [trap] = view.notes;
      const playing = guidance({
        picking: false,
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
        guidance({ picking: false, view, mode: 'explore', switches: { ...ALL_ON, showTraps } })
          .playable;
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

    it('shows a trap the learner fell into on its own card', () => {
      expect(shown(LANDED, 'explore').trapIn).toBe('card');
      expect(shown(LANDED, 'practice').trapIn).toBe('card');
      expect(shown(TRAP, 'explore').trapIn).toBeUndefined();
    });

    it("shows a trap fallen into through its moves and the learner's turn after them, until the line leaves it", () => {
      expect(shown(TRAP_PUNISHED, 'explore').trap).toMatchObject({ ply: TRAP.length });
      expect(shown([...TRAP_PUNISHED, 'a6'], 'explore').trap).toBeUndefined();
      // A move off the trap's sequence takes the card away before its last move.
      expect(shown([...LANDED, 'Bxd1'], 'explore').trap).toBeDefined();
      expect(shown([...LANDED, 'Qc7'], 'explore').trap).toBeUndefined();
      // So does the opponent's, even with the learner to move.
      expect(shown([...LANDED, 'Bxd1', 'Kxd1'], 'explore').trap).toBeUndefined();
      // Cut to end on the learner's move, the trap stays through the opponent's reply.
      const { moves } = sampleView(LANDED).trap!.trap;
      const lesson = withMistakeLine(SAMPLE, keyAfter(...TRAP), moves[0], moves.slice(1, -1));
      const trapAt = (sans: string[]) => {
        const line = uciLine(...sans);
        const view = lessonView({ lesson, line, ply: line.length, opponent: 1500 });
        return guidance({ picking: false, view, mode: 'explore', switches: ALL_ON }).trap;
      };
      expect(trapAt(TRAP_PUNISHED.slice(0, -1))).toBeDefined();
      expect(trapAt(TRAP_PUNISHED)).toBeDefined();
      expect(trapAt([...TRAP_PUNISHED, 'a6'])).toBeUndefined();
    });
  });
});

// Black's Berlin: White's 5.Nxe5? is marked, punished by 5...c6 6.Bc4 Qa5+,
// and the guide's note on it names the trap.
describe('a cue', () => {
  const BERLIN = readShippedLesson('berlin');
  const LINE = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Nf6', 'd3', 'Ne7', 'Nxe5', 'c6', 'Bc4', 'Qa5+'];
  const at = (sans: readonly string[], mode: LessonMode, ply = sans.length) => {
    const view = lessonView({ lesson: BERLIN, line: uciLine(...sans), ply, opponent: 1500 });
    return guidance({ view, mode, switches: ALL_ON, picking: false });
  };
  const upTo = (count: number) => LINE.slice(0, count);

  describe('in Explore', () => {
    it('shows its acts beside every hint', () => {
      const cue = at(upTo(9), 'explore');
      expect(cue.acts).toMatchObject({ found: false, payoff: 'ahead' });
      expect(cue.candidates.length).toBeGreaterThan(0);
      expect(cue.notes.length).toBeGreaterThan(0);
      expect(cue.opportunity).toBeUndefined();
    });

    it('follows the line through the payoff, and keeps its end as news', () => {
      expect(at(upTo(10), 'explore').acts).toMatchObject({ found: true, payoff: 'playing' });
      expect(at(upTo(12), 'explore').acts).toMatchObject({ found: true, payoff: 'done' });
      // The mistake's trap shows its note in the acts, not on its own card.
      expect(at(upTo(10), 'explore').trapIn).toBe('cue');
    });

    it('ends at a move off the line, which keeps only its move label', () => {
      const offLine = [...upTo(9), 'a6'];
      expect(at(offLine, 'explore').acts).toBeUndefined();
      // Stepped back onto the cue, it is the cue again.
      expect(at(offLine, 'explore', 9).acts).toMatchObject({ found: false });
    });

    it('has no acts before the mistake, nor where the moves pick the opening', () => {
      expect(at(upTo(8), 'explore').acts).toBeUndefined();
      const view = lessonView({
        lesson: BERLIN,
        line: uciLine(...upTo(9)),
        ply: 9,
        opponent: 1500,
      });
      expect(cueActs(view, 'explore', true)).toBeUndefined();
    });
  });

  describe('in Practice', () => {
    it("is an ordinary learner turn: nothing names it, and Practice's hiding applies", () => {
      const cue = at(upTo(9), 'practice');
      expect(cue.acts).toBeUndefined();
      expect(cue.opportunity).toBeUndefined();
      expect(cue.candidates).toEqual([]);
    });

    it("shows the answer found after the learner's move, with the mistake's note, through the payoff", () => {
      const found = at(upTo(10), 'practice');
      expect(found.opportunity).toMatchObject({ ply: 9, found: true });
      expect(found.trapIn).toBe('cue');
      expect(at(upTo(12), 'practice').opportunity).toMatchObject({ found: true });
    });

    it("shows a miss as news of the learner's move, until their next", () => {
      const missed = [...upTo(9), 'a6'];
      expect(at(missed, 'practice').opportunity).toMatchObject({ found: false });
      const answered = [...missed, 'Nf3'];
      expect(at(answered, 'practice').opportunity).toMatchObject({ found: false });
      expect(at([...answered, 'h6'], 'practice').opportunity).toBeUndefined();
      // Stepped back onto the cue, nothing names it again.
      expect(at(missed, 'practice', 9).opportunity).toBeUndefined();
    });
  });
});

describe('verdictSearch', () => {
  // Black's candidates after the Advance: Bf5 and c5, neither judged yet.
  const at = (pointer?: Pointer) => shown(ADVANCE, 'explore', {}, { pointer });
  const none = () => 'none' as const;

  it('waits until the board is ready, and searches the first candidate first', () => {
    expect(verdictSearch(at(), false, false, none)).toBeUndefined();
    expect(verdictSearch(at(), false, true, none)).toBe('c8f5');
  });

  it('takes a search already started, then the row pointed at, even one that gave up', () => {
    const pointed = at({ at: 'row', uci: 'c6c5' });
    expect(verdictSearch(pointed, false, true, none)).toBe('c6c5');
    expect(
      verdictSearch(pointed, false, true, (uci) => (uci === 'c8f5' ? 'started' : 'none')),
    ).toBe('c8f5');
    expect(verdictSearch(pointed, false, true, (uci) => (uci === 'c6c5' ? 'failed' : 'none'))).toBe(
      'c6c5',
    );
    // Unpointed, one that gave up waits, and a finished one is done.
    expect(verdictSearch(at(), false, true, (uci) => (uci === 'c8f5' ? 'failed' : 'none'))).toBe(
      'c6c5',
    );
    expect(verdictSearch(at(), false, true, () => 'final')).toBeUndefined();
  });

  it('searches nothing where the list shows no verdicts', () => {
    expect(verdictSearch(shown(ADVANCE, 'practice'), false, true, none)).toBeUndefined();
  });
});
