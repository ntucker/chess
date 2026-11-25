/**
 * An opportunity in a lesson, as Explore teaches it (piece E of
 * docs/plans/opportunities.md): the cue, where the side the learner plays
 * answers the other side's marked mistake, and the payoff after it. All of it
 * is derived from the lesson, the game's moves and Stockfish's answers; the
 * screen stores only what the learner chose at a cue (shown or skipped).
 */
import { parseUci } from 'chessops/util';

import type { FinalAnalysis } from '@/evaluation/evaluation';
import { positionKey, readPositionKey } from '@/game/replay';
import type { Lesson, LessonMove, PositionKey, Uci } from '@/lesson/lesson';
import { mistakeLine } from '@/lesson/mistakes';
import type { ReplyChoice } from '@/lesson/opponent';
import { guideMove } from '@/lesson/select';

import { acceptsReply } from './finder';

/**
 * A cue the line reached: the other side played a marked mistake, and the
 * learner's side is to punish it. Example: in the Stafford, after 5.d3 Bc5
 * 6.Bg5, the cue is the position before Black's 6...Nxe4.
 */
export interface Cue {
  /** How many moves of the line lead to the cue: the mistake is the line's move `ply - 1`. */
  readonly ply: number;
  /** The position the mistake was played in. */
  readonly before: PositionKey;
  /** The position after the mistake, where the learner answers it. */
  readonly key: PositionKey;
  /** The mistake, the punishing reply, then the payoff's moves (`mistakeLine`). */
  readonly line: readonly Uci[];
  /** How many moves of `line` the game plays, from the mistake on: at least 1. */
  readonly followed: number;
}

/**
 * The latest cue `line` reached within its first `shownMoves` moves: a guide
 * move with a `mistake` marker played by the side the learner doesn't play.
 * It needs no note naming the mark. A mistake of the learner's own side is a
 * trap (`LandedTrap` in src/lesson/view.ts), not a cue.
 */
export function lineCue(
  lesson: Lesson,
  line: readonly Uci[],
  keys: readonly PositionKey[],
  guideMoves: readonly (LessonMove | undefined)[],
  shownMoves: number,
): Cue | undefined {
  for (let n = shownMoves - 1; n >= 0; n--) {
    const move = guideMoves[n];
    if (!move?.mistake || readPositionKey(keys[n])!.turn === lesson.side) continue;
    const moves = mistakeLine(lesson, keys[n], move);
    const missed = moves.findIndex((uci, step) => uci !== line[n + step]);
    return {
      ply: n + 1,
      before: keys[n],
      key: keys[n + 1],
      line: moves,
      followed: missed === -1 ? moves.length : missed,
    };
  }
  return undefined;
}

/**
 * How a move the learner played at a cue stands: it punishes the mistake
 * (`passed`), doesn't (`failed`), is waiting for Stockfish (`pending`), or
 * can't be judged since a search it needs was given up (`unchecked`).
 */
export type TryVerdict = 'passed' | 'failed' | 'pending' | 'unchecked';

/** Stockfish's final answers a try may need, and whether each search was given up. */
export interface CueAnalyses {
  /** The position before the mistake. */
  readonly before?: FinalAnalysis;
  /** The cue's position. */
  readonly cue?: FinalAnalysis;
  readonly beforeFailed: boolean;
  readonly cueFailed: boolean;
}

/**
 * The verdict on `uci`, the learner's move at `cue`. The line's own reply
 * and a book move pass at once; any other move passes where the cue accepts
 * it (`acceptsReply`, the rule the importer's finder uses), which needs the
 * cue's final analysis and, for a move it lists after its first, the one
 * before the mistake.
 */
export function tryVerdict(
  lesson: Lesson,
  cue: Cue,
  uci: Uci,
  { before, cue: after, beforeFailed, cueFailed }: CueAnalyses,
): TryVerdict {
  if (uci === cue.line[1] || guideMove(lesson, cue.key, uci)?.book) return 'passed';
  if (!after) return cueFailed ? 'unchecked' : 'pending';
  const accepted = acceptsReply(before, after, lesson.side, uci);
  if (accepted === undefined) return beforeFailed ? 'unchecked' : 'pending';
  return accepted ? 'passed' : 'failed';
}

/**
 * The lesson opponent's choice through the payoff: at each position of the
 * cue's line, the line's move, so the payoff the learner plays is the one
 * the line teaches, whatever the opponent's band plays most there. Off the
 * line, the band's most played. Example: past 15...Qe7 16.Ng5 Qf6, where
 * the band's most played reply to 16.Ng5 is 16...Qxg5, it plays 16...Qf6.
 */
export function payoffReplies(cue: Cue): ReplyChoice {
  const position = readPositionKey(cue.before)!;
  const next = new Map<PositionKey, Uci>();
  for (const uci of cue.line) {
    next.set(positionKey(position), uci);
    position.play(parseUci(uci)!);
  }
  return (replies, key) => {
    const uci = next.get(key);
    return replies.find(({ move }) => move.uci === uci) ?? replies[0];
  };
}

/** What the learner chose at a cue, which the line can't tell: stored by the screen. */
export type CueChoice = 'shown' | 'skipped';

/**
 * Act II: the learner at the cue. `open` waits for a try, `shown` too with
 * the reply drawn; the rest say how the try went. (A skipped cue has no acts.)
 */
export type Found = 'open' | 'shown' | TryVerdict;

/**
 * Act III, once the cue is passed with the line's reply: still to come, being
 * played, played to the line's end, or none (the line ends at the reply, or
 * another reply passed, which the line has no payoff for).
 */
export type Payoff = 'ahead' | 'playing' | 'done' | 'none';

/** The three acts of the cue the board is in, as the screen shows them (`cueActs`). */
export interface Acts {
  readonly cue: Cue;
  readonly found: Found;
  readonly payoff: Payoff;
  /**
   * The board shows the cue with its question open (`found` is `open` or
   * `shown`): guidance hides every hint (src/lesson/guidance.ts).
   */
  readonly live: boolean;
  /**
   * The lesson opponent waits: the board's latest move is a try at the cue
   * that hasn't passed, so a wrong try gets no reply (the learner retries,
   * skips, or plays the reply themselves).
   */
  readonly held: boolean;
}

export interface ActsInput {
  readonly cue: Cue;
  /** The game's moves. */
  readonly moves: readonly Uci[];
  /** How many of them the board shows. */
  readonly ply: number;
  /** The verdict on the game's move at the cue (`moves[cue.ply]`), where it has one. */
  readonly verdict?: TryVerdict;
  /** What the learner chose at this cue, if anything. */
  readonly choice?: CueChoice;
  /** The side to move at the board is the learner's. */
  readonly learnerToMove: boolean;
}

/**
 * The acts of `cue` while the board is in them, else undefined: from the
 * cue to the last move the game plays along its line (a try off it counts
 * one move), and, where the game played the whole line, at the learner's
 * turn right after, so the news of its end stays until the learner moves
 * (as `newsShown` in src/lesson/guidance.ts). A skipped cue shows none: the board is ordinary
 * Explore again.
 */
export function cueActs({
  cue,
  moves,
  ply,
  verdict,
  choice,
  learnerToMove,
}: ActsInput): Acts | undefined {
  if (choice === 'skipped' || ply < cue.ply) return undefined;
  const tried = moves[cue.ply];
  const last = cue.ply - 1 + Math.max(cue.followed, tried === undefined ? 1 : 2);
  const ended = cue.followed === cue.line.length;
  if (ply > last + 1 || (ply === last + 1 && !(ended && learnerToMove))) return undefined;
  const passed = verdict === 'passed';
  const found: Found =
    ply === cue.ply ? (passed ? 'passed' : (choice ?? 'open')) : (verdict ?? 'open');
  const live = ply === cue.ply && (found === 'open' || found === 'shown');
  return {
    cue,
    found,
    payoff: payoffOf(cue, passed, tried === cue.line[1]),
    live,
    held: ply === cue.ply + 1 && ply === moves.length && !passed,
  };
}

function payoffOf(cue: Cue, passed: boolean, onLine: boolean): Payoff {
  if (cue.line.length <= 2 || (passed && !onLine)) return 'none';
  if (!passed) return 'ahead';
  return cue.followed === cue.line.length ? 'done' : 'playing';
}
