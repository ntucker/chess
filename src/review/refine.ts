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
import type { NormalMove } from 'chessops/types';
import { parseUci } from 'chessops/util';

import {
  isMistake,
  percent,
  qualityRule,
  refutation,
  type ReviewQuality,
} from '@/analysis/quality';
import { type FinalAnalysis, scoreFor } from '@/evaluation/evaluation';
import { type Color, opposite, parsePosition, type Ply } from '@/game/replay';

import { hanging, materialGivenUp, recaptures, winsMaterial } from './exchange';
import type { ReviewInput, ReviewMove } from './review';

/** A move's loss below this (the mover's expected score, 0 to 1) is as good as the best's, for Brilliant. */
const AS_GOOD = 0.02;
/** The least material (in pawns) a Brilliant move gives up: a minor piece for a pawn, or the exchange. */
const SACRIFICE = 2;
/**
 * The mover's score after a Brilliant move must be this or more: it isn't
 * losing. 0.3 is about 2.3 pawns down on the win-chance curve, past where a
 * position counts as clearly worse.
 */
const NOT_LOSING = 0.3;
/** The second line must score under this for Brilliant and Great: the mover wasn't already winning. */
const WINNING = 0.9;
/**
 * The least the second line loses beside the first for Great. On 20 lichess
 * games between players rated about 1400 to 2000, searched as the review
 * searches, it fired 23 times, about once a game as the plan asks; 0.20
 * fired 8 times.
 */
const ONLY_MOVE = 0.1;

/** A move as `labelMove` judged it. */
type JudgedMove = Extract<ReviewMove, { status: 'judged' }>;

/** The game around a move: its positions, their final analyses, and what each move gives up. */
type Game = Pick<ReviewInput, 'plies' | 'analyses' | 'givenUp'>;

/**
 * What each move of the game gives up (`materialGivenUp`), `givenUp[n]` by
 * the move from `plies[n]`: worked out once a game, since it depends only on
 * the positions.
 */
export const movesGivenUp = (plies: readonly Ply[]): number[] =>
  plies.slice(1).map(({ move }, n) => materialGivenUp(parsePosition(plies[n].fen)!, played(move)));

/**
 * The review's label for `move`: Brilliant or Great for a best or good move
 * that earns it, Miss for a mistake or blunder that lets `previous` (the
 * opponent's move before it) go; else its own label.
 */
export function refine(
  move: JudgedMove,
  previous: ReviewMove | undefined,
  game: Game,
): ReviewQuality {
  const { quality } = move;
  if (quality === 'best' || quality === 'good') {
    if (brilliant(move, game)) return 'brilliant';
    if (great(move, game)) return 'great';
  }
  if (isMistake(quality) && missed(move, previous, game)) return 'miss';
  return quality;
}

/**
 * Brilliant: Stockfish's top move or one as good (`AS_GOOD`) that gives up
 * at least `SACRIFICE` in material, by a mover who wasn't already winning
 * and isn't losing after it.
 */
function brilliant({ ply, mover, quality, before, after }: JudgedMove, game: Game): boolean {
  if (quality === 'good' && before - after >= AS_GOOD) return false;
  return (
    after >= NOT_LOSING && !winning(game.analyses[ply]!, mover) && game.givenUp[ply] >= SACRIFICE
  );
}

/**
 * Great: Stockfish's top move when it ranks three moves (so others were
 * there to find) and the second loses `ONLY_MOVE` or more beside it, by a
 * mover who wasn't already winning, leaving out the moves anyone finds: out
 * of check, a recapture, a queen promotion, a capture that simply wins
 * material, or saving a piece about to be lost.
 */
function great({ ply, mover }: JudgedMove, { plies, analyses }: Game): boolean {
  const analysis = analyses[ply]!;
  const [first, second] = analysis.lines;
  const { uci } = plies[ply + 1].move!;
  if (analysis.lines.length < 3 || uci !== first.uci || winning(analysis, mover)) return false;
  if (scoreFor(first.evaluation, mover) - scoreFor(second.evaluation, mover) < ONLY_MOVE) {
    return false;
  }
  const pos = parsePosition(plies[ply].fen)!;
  const move = played(plies[ply + 1].move);
  const previous = plies[ply].move;
  return (
    !pos.isCheck() &&
    !(previous && recaptures(parsePosition(plies[ply - 1].fen)!, played(previous), move)) &&
    move.promotion !== 'queen' &&
    !winsMaterial(pos, move) &&
    !hanging(pos, move.from)
  );
}

/**
 * Miss: after the opponent's mistake or blunder that one reply punishes
 * (`refutation`, the board's red arrow), a mistake or blunder that leaves the
 * mover no worse off than before the opponent's error: it let the chance go
 * without giving back more.
 */
function missed({ ply, mover, after }: JudgedMove, previous: ReviewMove | undefined, game: Game) {
  if (previous?.status !== 'judged') return false;
  if (!refutation(previous.quality, game.analyses[ply], opposite(mover))) return false;
  return after >= 1 - previous.before;
}

/** Whether `mover` was already winning: even Stockfish's second line keeps a score of `WINNING`. */
const winning = ({ lines }: FinalAnalysis, mover: Color) =>
  scoreFor((lines[1] ?? lines[0]).evaluation, mover) >= WINNING;

/** A ply's move, which a game's moves always are: a piece from one square to another. */
const played = (move: Ply['move']) => parseUci(move!.uci) as NormalMove;

/**
 * What `quality` means, in words for its badge's tooltip: `qualityRule`'s
 * words, and the three labels the review adds.
 */
export function reviewRule(quality: ReviewQuality): string {
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
