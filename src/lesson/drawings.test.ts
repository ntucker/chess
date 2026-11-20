import { describe, expect, it } from '@jest/globals';
import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';

import { parsePositionKey } from '@/game/replay';

import { candidateDrawings, ideaDrawings, ideaPlayback, lessonDrawings } from './drawings';
import { guidance, type LessonSwitches } from './guidance';
import type { Idea } from './lesson';
import {
  ADVANCE,
  keyAfter,
  MAIN,
  SAMPLE,
  sampleView,
  TRAP,
  TRAP_PUNISHED,
  uciLine,
} from './lesson.fixture';
import { engineCandidates, mainCandidate } from './select';
import { preview } from './view';

const SWITCHES: LessonSwitches = {
  auto: true,
  showMoves: true,
  showTraps: false,
};

const explore = (sans: string[], row?: string, switches = SWITCHES) => {
  const view = sampleView(sans);
  const pointed = row === undefined ? undefined : preview(SAMPLE, view, { at: 'row', uci: row });
  return {
    view,
    shown: guidance({ picking: false, view, mode: 'explore', switches, preview: pointed }),
  };
};

const after = (...sans: string[]) => parsePositionKey(keyAfter(...sans))!;
const fen = (text: string) => Chess.fromSetup(parseFen(text).unwrap()).unwrap();
/** `idea` drawn after `sans` for a learner playing Black, as in the Caro-Kann. */
const drawn = (idea: Idea, position: Chess) => ideaDrawings(idea, position, 'black');

describe('mainCandidate', () => {
  it('picks the book move, else the most played', () => {
    expect(mainCandidate(sampleView(ADVANCE).candidates)?.san).toBe('Bf5');
    expect(mainCandidate(sampleView(MAIN).candidates)?.san).toBe('e5');
    expect(mainCandidate([])).toBeUndefined();
  });
});

describe('candidateDrawings', () => {
  it('lights each piece with an arrow, the main one last so its glow wins', () => {
    const [bf5, c5] = sampleView(ADVANCE).candidates;
    expect(candidateDrawings([bf5, c5])).toEqual([
      { kind: 'glow', square: 'c6', tone: 'other' },
      { kind: 'arrow', from: 'c6', to: 'c5', tone: 'other' },
      { kind: 'glow', square: 'c8', tone: 'main' },
      { kind: 'arrow', from: 'c8', to: 'f5', tone: 'main' },
    ]);
  });
});

describe('ideaDrawings', () => {
  it('draws a Purpose as its piece lit, an arrow to each target, and each target ringed', () => {
    expect(
      drawn(
        { type: 'purpose', from: 'e5', relation: 'controls', targets: ['d6', 'f6'] },
        after(...ADVANCE),
      ),
    ).toEqual([
      { kind: 'glow', square: 'e5', tone: 'main' },
      { kind: 'arrow', from: 'e5', to: 'd6', tone: 'main' },
      { kind: 'ring', square: 'd6', tone: 'target' },
      { kind: 'arrow', from: 'e5', to: 'f6', tone: 'main' },
      { kind: 'ring', square: 'f6', tone: 'target' },
    ]);
  });

  it("draws Pressure as each side's pieces lit in its tone, the target ringed and counted", () => {
    const pressure: Idea = {
      type: 'pressure',
      side: 'black',
      target: 'd4',
      attackers: ['c5', 'c6'],
      defenders: ['c3'],
    };
    expect(drawn(pressure, after(...ADVANCE, 'c5', 'c3', 'Nc6'))).toEqual([
      { kind: 'glow', square: 'c5', tone: 'main' },
      { kind: 'glow', square: 'c6', tone: 'main' },
      { kind: 'glow', square: 'c3', tone: 'other' },
      { kind: 'ring', square: 'd4', tone: 'target' },
      { kind: 'label', square: 'd4', text: '2 v 1', tone: 'target' },
    ]);
    // The same idea for a learner playing White swaps the tones.
    expect(
      ideaDrawings(pressure, after(...ADVANCE), 'white')
        .slice(0, 3)
        .map((d) => 'tone' in d && d.tone),
    ).toEqual(['other', 'other', 'main']);
  });

  it('numbers a Plan’s dashed routes and rings its goals; a lone route goes unnumbered', () => {
    expect(
      drawn(
        {
          type: 'plan',
          side: 'black',
          routes: [
            { from: 'b8', to: 'c6' },
            { from: 'd8', to: 'b6' },
          ],
          goals: ['d4'],
        },
        after(...ADVANCE, 'c5'),
      ),
    ).toEqual([
      { kind: 'arrow', from: 'b8', to: 'c6', tone: 'plan', dashed: true, step: 1 },
      { kind: 'arrow', from: 'd8', to: 'b6', tone: 'plan', dashed: true, step: 2 },
      { kind: 'ring', square: 'd4', tone: 'target' },
    ]);
    expect(
      drawn({ type: 'plan', side: 'black', routes: [{ from: 'b8', to: 'c6' }] }, after(...ADVANCE)),
    ).toEqual([
      { kind: 'arrow', from: 'b8', to: 'c6', tone: 'plan', dashed: true, step: undefined },
    ]);
  });

  it('draws a Threat in danger, and its answer as the move to look at', () => {
    expect(
      drawn({ type: 'threat', side: 'white', move: 'h4h5', answer: 'h7h6' }, after(...ADVANCE)),
    ).toEqual([
      { kind: 'arrow', from: 'h4', to: 'h5', tone: 'danger', step: undefined },
      { kind: 'arrow', from: 'h7', to: 'h6', tone: 'main', step: undefined },
    ]);
  });

  it('draws a Trap’s tempting move and the reply that punishes it, numbered', () => {
    const moves = uciLine(...TRAP_PUNISHED).slice(TRAP.length);
    expect(drawn({ type: 'trap', moves, verdict: 'losesMaterial' }, after(...TRAP))).toEqual([
      { kind: 'arrow', from: 'c6', to: 'e5', tone: 'danger', step: 1 },
      { kind: 'arrow', from: 'f3', to: 'e5', tone: 'danger', step: 2 },
    ]);
  });

  it('draws a Line’s first move', () => {
    expect(
      drawn({ type: 'line', moves: ['c6c5', 'c2c3'], verdict: 'equal' }, after(...ADVANCE)),
    ).toEqual([{ kind: 'arrow', from: 'c6', to: 'c5', tone: 'main', step: undefined }]);
  });

  it('fades all but the pawns for a Structure, and marks each feature', () => {
    const chain: Idea = {
      type: 'structure',
      side: 'white',
      features: [{ kind: 'pawnChain', squares: ['e5', 'd4'] }],
    };
    const [fade, ...marks] = drawn(chain, after(...ADVANCE));
    expect(fade).toEqual({
      kind: 'fade',
      except: expect.arrayContaining(['a2', 'd4', 'e5', 'c6', 'd5', 'h7']),
    });
    expect(fade.kind === 'fade' && fade.except).toHaveLength(16);
    // The chain runs from its base, which is ringed as the place to strike.
    expect(marks).toEqual([
      { kind: 'line', squares: ['d4', 'e5'], tone: 'other' },
      { kind: 'ring', square: 'd4', tone: 'target' },
    ]);
  });

  it('tints a file’s empty squares and rings weak pawns, leaving pieces untinted', () => {
    const files: Idea = {
      type: 'structure',
      side: 'black',
      features: [{ kind: 'halfOpenFile', files: ['c'] }],
    };
    expect(drawn(files, after(...MAIN, 'exd5', 'cxd5')).slice(1)).toEqual([
      { kind: 'tint', squares: ['c3', 'c4', 'c5', 'c6', 'c7'], tone: 'main' },
    ]);
    const isolated: Idea = {
      type: 'structure',
      side: 'black',
      features: [
        { kind: 'isolatedPawn', squares: ['d5'] },
        { kind: 'weakSquare', squares: ['c5', 'd5'] },
        { kind: 'pawnBreak', move: 'd5d4' },
      ],
    };
    expect(drawn(isolated, fen('4k3/pp3ppp/8/3p4/8/8/PP3PPP/4K3 w - - 0 1')).slice(1)).toEqual([
      { kind: 'ring', square: 'd5', tone: 'target' },
      { kind: 'tint', squares: ['c5'], tone: 'target' },
      { kind: 'ring', square: 'd5', tone: 'target' },
      { kind: 'arrow', from: 'd5', to: 'd4', tone: 'main', step: undefined },
    ]);
  });

  it("lights the two bishops, marks the side's space, and draws nothing for material", () => {
    const bishops = fen('2b1k3/8/8/8/8/8/8/2B1KB2 w - - 0 1');
    expect(drawn({ type: 'imbalance', side: 'white', kind: 'bishopPair' }, bishops)).toEqual([
      { kind: 'glow', square: 'c1', tone: 'other' },
      { kind: 'glow', square: 'f1', tone: 'other' },
    ]);
    expect(drawn({ type: 'imbalance', side: 'white', kind: 'space' }, after(...ADVANCE))).toEqual([
      // The empty squares tinted; e5 holds a pawn, so it is ringed.
      { kind: 'tint', squares: ['c5', 'd6', 'f6'], tone: 'other' },
      { kind: 'ring', square: 'e5', tone: 'other' },
    ]);
    expect(drawn({ type: 'imbalance', side: 'white', kind: 'material' }, bishops)).toEqual([]);
  });

  it('draws nothing for an Evaluation', () => {
    expect(drawn({ type: 'evaluation', value: 'equal' }, after(...ADVANCE))).toEqual([]);
  });
});

describe('ideaPlayback', () => {
  it("steps through a plan's routes on one board, castling with the rook", () => {
    const frames = ideaPlayback(
      {
        type: 'plan',
        side: 'white',
        routes: [
          { from: 'g1', to: 'f3' },
          { from: 'f1', to: 'e2' },
          { from: 'e1', to: 'g1' },
        ],
      },
      after('e4', 'e5'),
    );
    expect(frames.map(({ move }) => move && [move.from, move.to])).toEqual([
      undefined,
      ['g1', 'f3'],
      ['f1', 'e2'],
      ['e1', 'g1'],
    ]);
    expect(frames.every(({ turn, check }) => turn === 'white' && !check)).toBe(true);
    expect(frames[0].fen).toBe('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR');
    expect(frames[3].fen).toBe('rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPPBPPP/RNBQ1RK1');
  });

  it("steps through a trap's or line's moves as positions", () => {
    const moves = uciLine(...TRAP_PUNISHED).slice(TRAP.length);
    const frames = ideaPlayback({ type: 'trap', moves, verdict: 'losesMaterial' }, after(...TRAP));
    expect(frames).toHaveLength(moves.length + 1);
    expect(frames[1].move).toMatchObject({ from: 'c6', to: 'e5' });
    expect(frames.map(({ turn }) => turn)).toEqual(frames.map((frame) => fen(frame.fen).turn));
    expect(frames.at(-1)!.turn).toBe('black');
  });

  it('reports check where a move gives it', () => {
    const frames = ideaPlayback(
      { type: 'line', moves: ['d1h5'], verdict: 'equal' },
      after('e4', 'f5'),
    );
    expect(frames.map(({ check }) => check)).toEqual([false, true]);
  });
});

describe('lessonDrawings', () => {
  it('draws only the candidates when nothing is previewed', () => {
    const { view, shown } = explore(ADVANCE);
    expect(shown.ideas.length).toBeGreaterThan(0);
    expect(lessonDrawings(shown, view.key, 'black')).toEqual(candidateDrawings(shown.candidates));
  });

  it("lights a sliding preview's piece where it lands, and draws the ideas about the position after it", () => {
    const { shown } = explore(['e4'], 'c7c6');
    const { next } = shown.preview!.candidate;
    expect(lessonDrawings(shown, next, 'black')).toEqual([
      { kind: 'glow', square: 'c6', tone: 'main' },
      { kind: 'glow', square: 'c6', tone: 'main' },
      { kind: 'arrow', from: 'c6', to: 'd5', tone: 'main' },
      { kind: 'ring', square: 'd5', tone: 'target' },
    ]);
  });

  it('leaves out ideas about another position than the one shown', () => {
    const { view, shown } = explore(['e4'], 'c7c6');
    expect(lessonDrawings(shown, view.key, 'black')).toEqual([
      { kind: 'glow', square: 'c6', tone: 'main' },
    ]);
  });

  it('draws a trap beside the candidates when traps are shown', () => {
    const { view, shown } = explore(TRAP, undefined, { ...SWITCHES, showTraps: true });
    const drawings = lessonDrawings(shown, view.key, 'black');
    expect(drawings.slice(0, -2)).toEqual(candidateDrawings(shown.candidates));
    expect(drawings.slice(-2)).toEqual([
      { kind: 'arrow', from: 'c6', to: 'e5', tone: 'danger', step: 1 },
      { kind: 'arrow', from: 'f3', to: 'e5', tone: 'danger', step: 2 },
    ]);
  });

  it("leaves a ghost of a trap's tempting move where the punishment lands, and only there", () => {
    const landed = [...TRAP, 'Nxe5', 'Nxe5'];
    const { view, shown } = explore(landed);
    expect(lessonDrawings(shown, view.key, 'black').slice(-2)).toEqual([
      { kind: 'ghost', square: 'c6', piece: { role: 'knight', color: 'black' } },
      { kind: 'arrow', from: 'c6', to: 'e5', tone: 'danger', step: undefined },
    ]);
    const later = explore([...landed, 'Bxd1']);
    expect(later.shown.trap).toBeDefined();
    expect(lessonDrawings(later.shown, later.view.key, 'black')).not.toContainEqual(
      expect.objectContaining({ kind: 'ghost' }),
    );
  });

  it("marks Stockfish's best move where guidance does", () => {
    const view = sampleView([...ADVANCE, 'a6']);
    const top = engineCandidates(SAMPLE, view.key, [
      { uci: 'g1f3', evaluation: { score: 0.6, pawns: 0.7 } },
      { uci: 'c2c3', evaluation: { score: 0.55, pawns: 0.4 } },
    ]);
    const engine = { best: 'g1f3', top };
    const shown = guidance({ picking: false, view, mode: 'explore', switches: SWITCHES, engine });
    // Only the first of the top moves, as the best: no arrows for the rest.
    expect(lessonDrawings(shown, view.key, 'black')).toEqual([
      { kind: 'arrow', from: 'g1', to: 'f3', tone: 'engine', step: undefined },
    ]);
    // A top move previewed glows in Stockfish's tone where it lands.
    const previewed = guidance({
      picking: false,
      view,
      mode: 'explore',
      switches: SWITCHES,
      engine,
      preview: preview(SAMPLE, view, { at: 'row', uci: 'c2c3' }, top),
    });
    expect(lessonDrawings(previewed, keyAfter(...ADVANCE, 'a6', 'c3'), 'black')).toEqual([
      { kind: 'glow', square: 'c3', tone: 'engine' },
    ]);
  });

  it("draws a dragged piece's candidates in the tones the list gives them", () => {
    const view = sampleView(MAIN);
    const knight = view.candidates.find(({ san }) => san === 'Nc3')!;
    const pointed = preview(SAMPLE, view, { at: 'drag', from: 'b1', to: 'c3' });
    const shown = guidance({
      picking: false,
      view,
      mode: 'explore',
      switches: SWITCHES,
      preview: pointed,
      lifted: 'b1',
    });
    // Both knight moves, alternatives to the main e5.
    expect(shown.drawnCandidates.map(({ san }) => san)).toEqual(['Nc3', 'Nd2']);
    expect(lessonDrawings(shown, view.key, 'black')).toContainEqual({
      kind: 'arrow',
      from: knight.from,
      to: knight.to,
      tone: 'other',
    });
  });

  it('draws the ideas guidance draws, and nothing else, while a note is pointed at', () => {
    const view = sampleView(ADVANCE);
    const [note] = view.notes;
    const shown = guidance({
      picking: false,
      view,
      mode: 'explore',
      switches: SWITCHES,
      pointed: note.note,
    });
    expect(lessonDrawings(shown, view.key, 'black')).toEqual(
      shown.drawn.flatMap(({ idea }) => drawn(idea, after(...ADVANCE))),
    );
  });
});
