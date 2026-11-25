/**
 * What the lesson shows on the board: guidance's choices (./guidance.ts) as
 * the board's shapes (src/board/drawing.ts), and the boards an idea plays
 * back through. Each idea type draws as the tech plan's section 7 says; a
 * sequence of moves draws its first moves and plays back the rest.
 */
import type { Board } from 'chessops/board';
import type { Chess } from 'chessops/chess';
import { makeBoardFen, makeFen } from 'chessops/fen';
import { SquareSet } from 'chessops/squareSet';
import { type Color, FILE_NAMES, type FileName, type Piece, type SquareName } from 'chessops/types';
import { makeSquare, opposite, parseSquare } from 'chessops/util';

import { type Drawing, moveArrow, refutationArrow, type Tone } from '@/board/drawing';
import { parsePositionKey, pieceAt, playLine, type Position } from '@/game/replay';

import type { Guidance, PlayedBack } from './guidance';
import type { Imbalance, PositionKey, Structure, StructureFeature, Uci } from './lesson';
import type { BoardIdea } from './mistakes';
import { relativeRank, spaceSquares } from './pawns';
import { planBoards } from './plan';
import { type Candidate, mainCandidate } from './select';
import type { LandedTrap } from './view';

/**
 * The board's drawings for `guidance` while the board shows `shown`, for a
 * learner playing `learner`: the candidates and ideas guidance draws (ideas
 * only on the position they are about), a glow where a sliding preview's
 * piece lands (the board draws its slide), Stockfish's best move, the reply
 * that punishes the learner's mistake, and a trap fallen into.
 */
export function lessonDrawings(guidance: Guidance, shown: PositionKey, learner: Color): Drawing[] {
  const { main, opportunities } = guidance;
  const ideas = guidance.drawn.filter(({ at }) => at === shown).map(({ idea }) => idea);
  const slid = slidCandidate(guidance);
  return [
    ...(slid ? [glow(slid.to, candidateTone(slid, slid === main, opportunities))] : []),
    ...candidateDrawings(guidance.drawnCandidates, main, opportunities),
    ...ideasDrawings(ideas, shown, learner),
    ...bestDrawings(guidance.best),
    ...refutationArrow(guidance.refutation),
    ...(guidance.trap ? landedTrapDrawings(guidance.trap, shown) : []),
  ];
}

/**
 * `ideas`' drawings on the position `shown`, parsed only when there are some,
 * since this runs as the pointer moves.
 */
function ideasDrawings(ideas: readonly BoardIdea[], shown: PositionKey, learner: Color): Drawing[] {
  if (!ideas.length) return [];
  const position = parsePositionKey(shown)!;
  return ideas.flatMap((idea) => ideaDrawings(idea, position, learner));
}

/** The candidate a sliding preview shows played, if any. */
export const slidCandidate = ({ preview }: Guidance): Candidate | undefined =>
  preview?.slide ? preview.candidate : undefined;

/**
 * A candidate's tone, on the board and its list row: the danger tone for the
 * other side's marked mistake where guidance points those out
 * (`Guidance.opportunities`), else the main one's, an alternative's, or
 * Stockfish's for its top moves.
 */
export const candidateTone = (
  candidate: Candidate,
  isMain: boolean,
  opportunities = false,
): Tone =>
  opportunities && candidate.move.mistake
    ? 'danger'
    : candidate.engine
      ? 'engine'
      : isMain
        ? 'main'
        : 'other';

const glow = (square: SquareName, tone: Tone): Drawing => ({ kind: 'glow', square, tone });

/**
 * Each candidate's piece lit, with an arrow to where it goes, in its tone
 * (`candidateTone`): `main` (see `mainCandidate`) in the main tone, the rest
 * as alternatives.
 */
export function candidateDrawings(
  candidates: readonly Candidate[],
  main = mainCandidate(candidates),
  opportunities = false,
): Drawing[] {
  const draw = (candidate: Candidate): Drawing[] => {
    const tone = candidateTone(candidate, candidate === main, opportunities);
    return [
      glow(candidate.from, tone),
      { kind: 'arrow', from: candidate.from, to: candidate.to, tone },
    ];
  };
  // The main move last, so its glow wins where two candidates move one piece.
  return [
    ...candidates.filter((c) => c !== main).flatMap(draw),
    ...candidates.filter((c) => c === main).flatMap(draw),
  ];
}

/**
 * Whether `idea` draws on the board at all (`ideaDrawings`): an evaluation
 * and a material imbalance are only words.
 */
export const drawsOnBoard = (idea: BoardIdea) =>
  idea.type !== 'evaluation' && !(idea.type === 'imbalance' && idea.kind === 'material');

/**
 * What `idea` draws in `position`, the position it is checked in. A side's
 * own pieces and squares are drawn in the main tone when it is `learner`'s
 * side and as the other side's otherwise, so both sides' features in one note
 * stay apart.
 */
export function ideaDrawings(idea: BoardIdea, position: Chess, learner: Color): Drawing[] {
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
        ...idea.routes.map(({ from, to }, n): Drawing => ({
          kind: 'arrow',
          from,
          to,
          tone,
          dashed: true,
          step: numbered ? n + 1 : undefined,
        })),
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
export function ideaTone(idea: BoardIdea, learner: Color): Tone {
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

/**
 * One board of an idea's playback, shaped like the game's own boards
 * (`Position`) so the board shows either the same way. A plan's boards
 * aren't games: the FEN is only the pieces, the plan's side is to move
 * throughout, and it is never in check.
 */
export interface PlaybackFrame extends Pick<Position, 'fen' | 'turn' | 'check'> {
  /** The move that led here; absent on the first frame. */
  readonly move?: Pick<NonNullable<Position['move']>, 'from' | 'to'>;
}

/**
 * The boards `idea` steps through from `position`, the position it is
 * checked in: a plan's routes, a line's or trap's moves.
 */
export function ideaPlayback(idea: PlayedBack, position: Chess): PlaybackFrame[] {
  switch (idea.type) {
    case 'plan':
      return planBoards(position, idea).map((board, n) => ({
        fen: makeBoardFen(board),
        turn: idea.side,
        check: false,
        move: idea.routes[n - 1],
      }));
    case 'line':
    case 'trap':
      return Array.from(playLine(idea.moves, position.clone()), ({ pos, move }) => ({
        fen: makeFen(pos.toSetup()),
        turn: pos.turn,
        check: pos.isCheck(),
        move,
      }));
  }
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
        // Only the empty squares: the file's pieces aren't part of it.
        return tint(squaresOf(fileSquares(f.files).diff(board.occupied)), tone);
      case 'pawnBreak':
        return [moveArrow(f.move, tone)];
    }
  };
  return [{ kind: 'fade', except: squaresOf(board.pawn) }, ...features.flatMap(feature)];
}

/**
 * An imbalance's pieces or squares: both bishops lit, or the side's space
 * (`spaceSquares`, the squares the checker counts) marked. Material draws
 * nothing, since the player bars already show who is ahead.
 */
function imbalanceDrawings({ side, kind }: Imbalance, board: Board, tone: Tone): Drawing[] {
  switch (kind) {
    case 'bishopPair':
      return squaresOf(board.pieces(side, 'bishop')).map((square) => ({
        kind: 'glow',
        square,
        tone,
      }));
    case 'space':
      return marked(squaresOf(spaceSquares(board, side)), tone, board);
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
 * ringed, since a square with a piece is never tinted.
 */
function marked(squares: readonly SquareName[], tone: Tone, board: Board): Drawing[] {
  const occupied = (square: SquareName) => board.has(parseSquare(square)!);
  return [
    ...tint(
      squares.filter((square) => !occupied(square)),
      tone,
    ),
    ...rings(squares.filter(occupied), tone),
  ];
}

const tint = (squares: SquareName[], tone: Tone): Drawing[] =>
  squares.length ? [{ kind: 'tint', squares, tone }] : [];

const fileSquares = (files: readonly FileName[]) =>
  files.reduce(
    (set, file) => set.union(SquareSet.fromFile(FILE_NAMES.indexOf(file))),
    SquareSet.empty(),
  );

/** `side`'s pawns on `files`. */
const filePawns = (board: Board, side: Color, files: readonly FileName[]) =>
  squaresOf(board.pieces(side, 'pawn').intersect(fileSquares(files)));

/** Stockfish's best move, where guidance marks it (see `Guidance.best`). */
const bestDrawings = (best: Uci | undefined): Drawing[] =>
  best ? [moveArrow(best, 'engine')] : [];

/**
 * A trap the line fell into, while the board shows where it landed: the
 * tempting move as a danger arrow, with a ghost of its piece where it stood.
 */
function landedTrapDrawings({ trap, note, landed }: LandedTrap, shown: PositionKey): Drawing[] {
  if (landed !== shown) return [];
  const tempting = moveArrow(trap.moves[0], 'danger');
  const piece = pieceAt(note.after, tempting.from)!;
  return [ghost(tempting.from, piece), tempting];
}

/** A faint `piece` on `square`, where it stood before moving. */
const ghost = (square: SquareName, { role, color }: Piece): Drawing => ({
  kind: 'ghost',
  square,
  piece: { role, color },
});
