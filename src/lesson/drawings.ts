/**
 * What the lesson shows on the board: guidance's choices (./guidance.ts) as
 * the board's shapes (src/board/drawing.ts), and the boards an idea plays
 * back through. Each idea type draws as the tech plan's section 7 says; a
 * sequence of moves draws its first moves and plays back the rest.
 */
import { pawnAttacks } from 'chessops/attacks';
import type { Board } from 'chessops/board';
import type { Chess } from 'chessops/chess';
import { makeBoardFen, makeFen } from 'chessops/fen';
import { SquareSet } from 'chessops/squareSet';
import { type Color, FILE_NAMES, type FileName, type Piece, type SquareName } from 'chessops/types';
import { makeSquare, opposite, parseSquare } from 'chessops/util';

import type { Drawing, Tone } from '@/board/drawing';
import { parsePositionKey, playLine } from '@/game/replay';

import type { Guidance, ShownIdea } from './guidance';
import type { Idea, Imbalance, PositionKey, Structure, StructureFeature, Uci } from './lesson';
import { relativeRank } from './pawns';
import { planBoards } from './plan';
import type { Candidate } from './select';
import type { LandedTrap, ShownNote } from './view';

/**
 * The board's drawings for `guidance` while the board shows `shown`, for a
 * learner playing `learner`. A previewed move is drawn with its ideas: a
 * sliding preview leaves a ghost where its piece stood. Otherwise the
 * candidates are drawn without the ideas, since their arrows would share the
 * board's colors, except a trap's, which are drawn in danger's; the ideas
 * only where there are no candidates. That rule is on trial; once settled, it
 * belongs in guidance.ts, which decides what is hidden. Ideas are drawn only
 * on the position they are about, and of several plans only the first.
 */
export function lessonDrawings(guidance: Guidance, shown: PositionKey, learner: Color): Drawing[] {
  const { preview, candidates } = guidance;
  const here = guidance.ideas.filter(({ at }) => at === shown).map(({ idea }) => idea);
  // One plan at a time: two plans' numbered routes would read as one sequence.
  const firstPlan = here.find(({ type }) => type === 'plan');
  const ideas = here.filter((idea) => idea.type !== 'plan' || idea === firstPlan);
  // Parsed only where there are ideas to draw, since this runs as the pointer moves.
  const draw = (some: readonly Idea[]) => {
    if (!some.length) return [];
    const position = parsePositionKey(shown)!;
    return some.flatMap((idea) => ideaDrawings(idea, position, learner));
  };
  if (preview?.slide) return [ghost(preview.candidate.from, preview.candidate.piece), ...draw(ideas)];
  if (preview) return [...candidateDrawings([preview.candidate]), ...draw(ideas)];
  const facts = [...bestDrawings(guidance.best), ...(guidance.trap ? landedTrapDrawings(guidance.trap, shown) : [])];
  if (!candidates.length) return [...draw(ideas), ...facts];
  return [...candidateDrawings(candidates), ...draw(ideas.filter(({ type }) => type === 'trap')), ...facts];
}

/** The candidate to look at first: the book move, or else the most played. */
export const mainCandidate = (candidates: readonly Candidate[]): Candidate | undefined =>
  candidates.find(({ move }) => move.book) ?? candidates[0];

/**
 * Each candidate's piece lit, with an arrow to where it goes: the main one
 * (`mainCandidate`) in the main tone, the rest as alternatives.
 */
export function candidateDrawings(candidates: readonly Candidate[]): Drawing[] {
  const main = mainCandidate(candidates);
  const draw = ({ from, to }: Candidate, tone: Tone): Drawing[] => [
    { kind: 'glow', square: from, tone },
    { kind: 'arrow', from, to, tone },
  ];
  // The main move last, so its glow wins where two candidates move one piece.
  return [
    ...candidates.filter((c) => c !== main).flatMap((c) => draw(c, 'other')),
    ...(main ? draw(main, 'main') : []),
  ];
}

/**
 * What `idea` draws in `position`, the position it is checked in. A side's
 * own pieces and squares are drawn in the main tone when it is `learner`'s
 * side and as the other side's otherwise, so both sides' features in one note
 * stay apart.
 */
export function ideaDrawings(idea: Idea, position: Chess, learner: Color): Drawing[] {
  const tone = ideaTone(idea, learner);
  switch (idea.type) {
    case 'purpose':
      return [
        { kind: 'glow', square: idea.from, tone },
        ...idea.targets.flatMap((target): Drawing[] => [
          { kind: 'arrow', from: idea.from, to: target, tone },
          { kind: 'ring', square: target, tone: 'target' },
        ]),
      ];
    case 'pressure': {
      const defending = toneOf(opposite(idea.side), learner);
      return [
        ...idea.attackers.map((square): Drawing => ({ kind: 'glow', square, tone })),
        ...idea.defenders.map((square): Drawing => ({ kind: 'glow', square, tone: defending })),
        { kind: 'ring', square: idea.target, tone: 'target' },
        {
          kind: 'label',
          square: idea.target,
          text: `${idea.attackers.length} v ${idea.defenders.length}`,
          tone: 'target',
        },
      ];
    }
    case 'plan': {
      const numbered = idea.routes.length > 1;
      return [
        ...idea.routes.map(
          ({ from, to }, n): Drawing => ({
            kind: 'arrow',
            from,
            to,
            tone,
            dashed: true,
            step: numbered ? n + 1 : undefined,
          }),
        ),
        ...(idea.goals ?? []).map((square): Drawing => ({ kind: 'ring', square, tone: 'target' })),
      ];
    }
    case 'threat':
      return [
        moveArrow(idea.move, tone),
        ...(idea.answer === undefined ? [] : [moveArrow(idea.answer, 'main')]),
      ];
    case 'trap':
      // The tempting move and the reply that punishes it; the rest plays back.
      return idea.moves.slice(0, 2).map((uci, n) => moveArrow(uci, tone, n + 1));
    case 'line':
      return [moveArrow(idea.moves[0], tone)];
    case 'structure':
      return structureDrawings(idea, position.board, tone);
    case 'imbalance':
      return imbalanceDrawings(idea, position.board, tone);
    case 'evaluation':
      return [];
  }
}

/** A side's tone: the main one for `learner`'s, the other for its opponent's. */
const toneOf = (side: Color, learner: Color): Tone => (side === learner ? 'main' : 'other');

/** The tone an idea's drawings lead with; the idea card's dot matches it. */
export function ideaTone(idea: Idea, learner: Color): Tone {
  switch (idea.type) {
    case 'plan':
      return 'plan';
    case 'threat':
    case 'trap':
      return 'danger';
    case 'pressure':
    case 'structure':
    case 'imbalance':
      return toneOf(idea.side, learner);
    case 'purpose':
    case 'line':
    case 'evaluation':
      return 'main';
  }
}

/** One board of an idea's playback, and the move that led to it. */
export interface PlaybackFrame {
  /** The board as FEN: only the pieces for a plan, whose boards aren't games. */
  readonly fen: string;
  /** The move that led here, from and to; absent on the first frame. */
  readonly move?: readonly [SquareName, SquareName];
}

/**
 * The boards `idea` steps through from `position`, the position it is
 * checked in: a plan's routes, a line's or trap's moves. Empty for an idea
 * that doesn't play back.
 */
export function ideaPlayback(idea: Idea, position: Chess): PlaybackFrame[] {
  switch (idea.type) {
    case 'plan':
      return planBoards(position, idea).map((board, n) => {
        const route = idea.routes[n - 1];
        return { fen: makeBoardFen(board), move: route && [route.from, route.to] };
      });
    case 'line':
    case 'trap':
      return Array.from(playLine(idea.moves, position.clone()), ({ pos, move }) => ({
        fen: makeFen(pos.toSetup()),
        move: move && [move.from, move.to],
      }));
    default:
      return [];
  }
}

/** The ideas that play back: a plan's routes, a line's or trap's moves. */
export type PlayedBack = Extract<Idea, { type: 'plan' | 'line' | 'trap' }>;

/** An idea shown on the board that plays back. */
type ShownPlayback = ShownIdea & { readonly idea: PlayedBack };

const playsBack = (shown: ShownIdea): shown is ShownPlayback =>
  shown.idea.type === 'plan' || shown.idea.type === 'line' || shown.idea.type === 'trap';

/**
 * The idea of `note` that plays back on the board, of those `guidance` draws
 * (so a trap plays back only while traps are shown); or undefined.
 */
export function notePlayback(guidance: Guidance, { note }: ShownNote): ShownPlayback | undefined {
  return guidance.ideas.filter(playsBack).find(({ idea }) => note.ideas?.includes(idea));
}

const squaresOf = (set: SquareSet): SquareName[] => [...set].map(makeSquare);

/**
 * A structure's features over its pawns: every piece but the pawns fades.
 * Weaknesses (isolated, backward and doubled pawns, holes, a chain's base)
 * are targets; the rest are drawn in the side's `tone`.
 */
function structureDrawings({ side, features }: Structure, board: Board, tone: Tone): Drawing[] {
  const feature = (f: StructureFeature): Drawing[] => {
    switch (f.kind) {
      case 'isolatedPawn':
      case 'backwardPawn':
        return rings(f.squares, 'target');
      case 'passedPawn':
        return rings(f.squares, tone);
      case 'pawnChain': {
        // Base first: the rearmost pawn, which the chain rests on.
        const chain = [...f.squares].sort((a, b) => rank(side, a) - rank(side, b));
        return [{ kind: 'line', squares: chain, tone }, ...rings(chain.slice(0, 1), 'target')];
      }
      case 'weakSquare':
        return marked(f.squares, 'target', board);
      case 'outpost':
        return marked(f.squares, tone, board);
      case 'doubledPawns':
        return rings(filePawns(board, side, f.files), 'target');
      case 'pawnMajority':
        return rings(filePawns(board, side, f.files), tone);
      case 'openFile':
      case 'halfOpenFile':
        return marked(squaresOf(fileSquares(f.files)), tone, board, false);
      case 'pawnBreak':
        return [moveArrow(f.move, tone)];
    }
  };
  return [{ kind: 'fade', except: squaresOf(board.pawn) }, ...features.flatMap(feature)];
}

/**
 * An imbalance's pieces or squares: both bishops lit, or the empty squares
 * the side's pawns take in the other half of the board. Material draws
 * nothing, since the player bars already show who is ahead.
 */
function imbalanceDrawings({ side, kind }: Imbalance, board: Board, tone: Tone): Drawing[] {
  switch (kind) {
    case 'bishopPair':
      return squaresOf(board.pieces(side, 'bishop')).map((square) => ({ kind: 'glow', square, tone }));
    case 'space': {
      const taken = [...board.pieces(side, 'pawn')].reduce(
        (set, pawn) => set.union(pawnAttacks(side, pawn)),
        SquareSet.empty(),
      );
      const squares = squaresOf(taken.diff(board.occupied)).filter((square) => rank(side, square) >= 4);
      return squares.length ? [{ kind: 'tint', squares, tone }] : [];
    }
    case 'material':
      return [];
  }
}

/** How far up the board `square` is from `side`'s back rank, 0 to 7. */
const rank = (side: Color, square: SquareName) => relativeRank(side, parseSquare(square)!);

const rings = (squares: readonly SquareName[], tone: Tone): Drawing[] =>
  squares.map((square) => ({ kind: 'ring', square, tone }));

/**
 * `squares` marked in `tone`: the empty ones tinted, and the occupied ones
 * ringed, since a square with a piece is never tinted (or left out, when
 * `ringPieces` is false: an open file's pieces aren't part of it).
 */
function marked(squares: readonly SquareName[], tone: Tone, board: Board, ringPieces = true): Drawing[] {
  const occupied = (square: SquareName) => board.has(parseSquare(square)!);
  const empty = squares.filter((square) => !occupied(square));
  return [
    ...(empty.length ? [{ kind: 'tint', squares: empty, tone } as const] : []),
    ...(ringPieces ? rings(squares.filter(occupied), tone) : []),
  ];
}

const fileSquares = (files: readonly FileName[]) =>
  files.reduce((set, file) => set.union(SquareSet.fromFile(FILE_NAMES.indexOf(file))), SquareSet.empty());

/** `side`'s pawns on `files`. */
const filePawns = (board: Board, side: Color, files: readonly FileName[]) =>
  squaresOf(board.pieces(side, 'pawn').intersect(fileSquares(files)));

/** An arrow for a move written in UCI, numbered `step` in a sequence. */
const moveArrow = (uci: Uci, tone: Tone, step?: number): Extract<Drawing, { kind: 'arrow' }> => ({
  kind: 'arrow',
  from: uci.slice(0, 2) as SquareName,
  to: uci.slice(2, 4) as SquareName,
  tone,
  step,
});

/** Stockfish's best move, where guidance marks it (see `Guidance.best`). */
const bestDrawings = (best: Uci | undefined): Drawing[] => (best ? [moveArrow(best, 'engine')] : []);

/**
 * A trap the line fell into, once the board shows its last move: the
 * tempting move as a danger arrow, with a ghost of its piece where it stood.
 */
function landedTrapDrawings({ trap, at, end }: LandedTrap, shown: PositionKey): Drawing[] {
  if (end !== shown) return [];
  const tempting = moveArrow(trap.moves[0], 'danger');
  const piece = parsePositionKey(at)!.board.get(parseSquare(tempting.from)!)!;
  return [ghost(tempting.from, piece), tempting];
}

/** A faint `piece` on `square`, where it stood before moving. */
const ghost = (square: SquareName, { role, color }: Piece): Drawing => ({
  kind: 'ghost',
  square,
  piece: { role, color },
});
