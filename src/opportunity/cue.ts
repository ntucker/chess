/**
 * An opportunity in a lesson (piece E of docs/plans/opportunities.md): the
 * cue, where the side the learner plays answers the other side's marked
 * mistake, and the payoff after it. All of it is derived from the lesson and
 * the game's moves; what each mode shows of it is src/lesson/guidance.ts's.
 */
import { playLine, readPositionKey } from '@/game/replay';
import type { Lesson, LessonMove, PositionKey, Uci } from '@/lesson/lesson';
import { followedMoves, mistakeLine } from '@/lesson/mistakes';
import type { ReplyChoice } from '@/lesson/opponent';

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
  /** The game's move at the cue, once played. */
  readonly tried?: Uci;
  /**
   * `tried` punishes the mistake: it is the line's reply, or a move the guide
   * books at the cue (the finder books every reply it accepts, except at a
   * mark the study already made). Where a clean Practice run can reach the
   * cue, the line's reply is booked too (`checkLesson`), so a found move
   * keeps the run clean; elsewhere the run is no longer clean anyway. False
   * until a move is tried; read it with `tried`.
   */
  readonly found: boolean;
}

/**
 * The latest cue `line` reached within its first `shownMoves` moves: a guide
 * move with a `mistake` marker played by the side the learner doesn't play.
 * It needs no note naming the mark, but its line needs the punishing
 * reply. A mistake of the learner's own side is a trap (`LandedTrap` in
 * src/lesson/view.ts), not a cue.
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
    // A mark the guide gives no punishing reply has nothing to find.
    if (moves.length < 2) continue;
    const tried = line.at(n + 1);
    return {
      ply: n + 1,
      before: keys[n],
      key: keys[n + 1],
      line: moves,
      followed: followedMoves(moves, line, n),
      tried,
      found: tried !== undefined && (tried === moves[1] || guideMoves[n + 1]?.book === true),
    };
  }
  return undefined;
}

/**
 * The lesson opponent's choice through the payoff: at each position of the
 * cue's line, the line's move, so the payoff the learner plays is the one
 * the line teaches, whatever the opponent's band plays most there. Off the
 * line, the band's most played. Example: past 15...Qe7 16.Ng5 Qf6, where
 * the band's most played reply to 16.Ng5 is 16...Qxg5, it plays 16...Qf6.
 */
export function payoffReplies(cue: Cue): ReplyChoice {
  const steps = Array.from(playLine(cue.line, readPositionKey(cue.before)!));
  const next = new Map(cue.line.map((uci, n) => [steps[n].key, uci]));
  return (replies, key) => {
    const uci = next.get(key);
    return replies.find(({ move }) => move.uci === uci) ?? replies[0];
  };
}

/**
 * Act III, the payoff, with the board `ply` moves in: still to come at the
 * cue, being played, played to the line's end, or none (the line ends at
 * the reply).
 */
export type PayoffStage = 'ahead' | 'playing' | 'done' | 'none';

export function payoffAt(cue: Cue, ply: number): PayoffStage {
  if (cue.line.length <= 2) return 'none';
  if (ply === cue.ply) return 'ahead';
  return ply >= cue.ply - 1 + cue.line.length ? 'done' : 'playing';
}

/**
 * The three acts of the cue the board is in, as Explore shows them beside
 * every hint: I Setup (reached), II Your cue (`replied` once the line's reply
 * is played: a move off the line ends the acts), III Payoff.
 */
export interface Acts {
  readonly cue: Cue;
  readonly replied: boolean;
  readonly payoff: PayoffStage;
}
