/**
 * The review's three extra labels, which refine a judged move's label
 * (`judgement`) once the whole game is searched; the game's live labels
 * never change. Example: 12.Bxh7+, Stockfish's top move, gives up a bishop
 * for a pawn and isn't already winning: Brilliant, where the game called it
 * Best.
 *
 * - Brilliant: a move as good as the best that gives up a piece.
 * - Great: the one good move, when every other loses a lot.
 * - Miss: a mistake or blunder right after the opponent's own, letting it go.
 */
import { parseSquare } from 'chessops/util';

import { qualityRule, refutation, type ReviewQuality } from '@/analysis/quality';
import { type FinalAnalysis, scoreFor } from '@/evaluation/evaluation';
import { type Color, opposite, parsePosition } from '@/game/replay';

import { hanging, materialGivenUp, winsMaterial } from './exchange';
import type { ReviewInput, ReviewMove } from './review';

/** A move's loss below this (the mover's expected score, 0 to 1) is as good as the best's, for Brilliant. */
const AS_GOOD = 0.02;
/** The least material (in pawns) a Brilliant move gives up: a minor piece for a pawn, or the exchange. */
const SACRIFICE = 2;
/** The mover's score after a Brilliant move must be this or more: it isn't losing. */
const NOT_LOSING = 0.3;
/** The second line must score under this for Brilliant and Great: the mover wasn't already winning. */
const WINNING = 0.9;
/**
 * The least the second line loses beside the first for Great. On the games
 * measured, 0.10 fires about once a game, as chess.com's Great does.
 */
const ONLY_MOVE = 0.1;

/** A move as `labelMove` judged it. */
type JudgedMove = Extract<ReviewMove, { status: 'judged' }>;

/** The game around a move: its positions and their final analyses. */
type Game = Pick<ReviewInput, 'plies' | 'analyses'>;

/**
 * The review's label for `move`: Brilliant or Great for a best or good move
 * that earns it, Miss for a mistake or blunder that lets `previous` (the
 * opponent's move before it, labelled) go; else its own label.
 */
export function refine(
  move: JudgedMove,
  previous: ReviewQuality | undefined,
  game: Game,
): ReviewQuality {
  const { quality } = move;
  if (quality === 'best' || quality === 'good') {
    if (brilliant(move, game)) return 'brilliant';
    if (great(move, game)) return 'great';
  }
  if ((quality === 'mistake' || quality === 'blunder') && missed(move, previous, game)) {
    return 'miss';
  }
  return quality;
}

/**
 * Brilliant: Stockfish's top move or one as good (`AS_GOOD`) that gives up
 * at least `SACRIFICE` in material (`materialGivenUp`), by a mover who wasn't
 * already winning and isn't losing after it.
 */
function brilliant({ ply, mover, quality, before, after }: JudgedMove, game: Game): boolean {
  if (quality === 'good' && before - after >= AS_GOOD) return false;
  if (after < NOT_LOSING || winning(game.analyses[ply]!, mover)) return false;
  return materialGivenUp(parsePosition(game.plies[ply].fen)!, uciAt(game, ply)) >= SACRIFICE;
}

/**
 * Great: Stockfish's top move when it ranks three and the second loses
 * `ONLY_MOVE` or more beside it, by a mover who wasn't already winning,
 * leaving out the moves anyone finds: out of check, a recapture, a queen
 * promotion, a capture that simply wins material, or saving a piece about to
 * be lost.
 */
function great({ ply, mover }: JudgedMove, game: Game): boolean {
  const analysis = game.analyses[ply]!;
  const [first, second, third] = analysis.lines;
  const uci = uciAt(game, ply);
  if (!third || uci !== first.uci || winning(analysis, mover)) return false;
  if (scoreFor(first.evaluation, mover) - scoreFor(second.evaluation, mover) < ONLY_MOVE) {
    return false;
  }
  const pos = parsePosition(game.plies[ply].fen)!;
  const previous = game.plies[ply].move;
  const recapture = previous?.san.includes('x') && previous.to === uci.slice(2, 4);
  return (
    !pos.isCheck() &&
    !recapture &&
    !uci.endsWith('q') &&
    !winsMaterial(pos, uci) &&
    !hanging(pos, parseSquare(uci.slice(0, 2))!)
  );
}

/**
 * Miss: after the opponent's mistake or blunder that one reply punishes
 * (`refutation`, the board's red arrow), a mistake or blunder that leaves the
 * mover no worse off than before the opponent's error: it let the chance go
 * without giving back more.
 */
function missed(
  { ply, mover, after }: JudgedMove,
  previous: ReviewQuality | undefined,
  game: Game,
) {
  if (previous !== 'mistake' && previous !== 'blunder') return false;
  if (!refutation(previous, game.analyses[ply], opposite(mover))) return false;
  return after >= scoreFor(game.analyses[ply - 1]!.lines[0].evaluation, mover);
}

/** Whether `mover` was already winning: even Stockfish's second line keeps a score of `WINNING`. */
const winning = ({ lines }: FinalAnalysis, mover: Color) =>
  scoreFor((lines[1] ?? lines[0]).evaluation, mover) >= WINNING;

const uciAt = ({ plies }: Game, ply: number) => plies[ply + 1].move!.uci;

/**
 * What `quality` means, in words for its badge's tooltip: `qualityRule`'s
 * words, and the three labels the review adds.
 */
export function reviewRule(quality: ReviewQuality): string {
  const percent = (score: number) => `${Math.round(score * 100)}%`;
  switch (quality) {
    case 'brilliant':
      return "gave up a piece for Stockfish's top move, or one as good, without already winning";
    case 'great':
      return `the only good move, as Stockfish's next best gave away ${percent(ONLY_MOVE)} or more of the winning chances`;
    case 'miss':
      return "after the opponent's mistake, passed up the move that punished it";
    default:
      return qualityRule(quality);
  }
}
