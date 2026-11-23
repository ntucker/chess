/**
 * The walk behind the opponent check (./coverOpponent.ts): the learner's lesson
 * against an opponent, from a start, as a tree of the moves both play.
 */
import { Chess } from 'chessops/chess';
import { ChildNode, makePgn, Node, type PgnNodeData } from 'chessops/pgn';

import { playMove, positionKey, sanToUci } from '@/game/replay';
import type { Lesson, Uci } from '@/lesson/lesson';

/** A position waiting to be walked, and where its moves go in the tree. */
export interface Step {
  readonly pos: Chess;
  /** The moves from the start, in SAN. */
  readonly line: readonly string[];
  readonly ucis: readonly Uci[];
  readonly node: Node<PgnNodeData>;
}

export interface Players {
  readonly learner: Lesson;
  /** The learner is answered through this move of theirs. */
  readonly moves: number;
  /** The opponent's moves at a position. */
  readonly opponent: (step: Step) => Promise<readonly Uci[]>;
  /**
   * A move for each of the learner's positions with no book move, or undefined to leave
   * one open. Called once for each depth of the walk, so the moves can be asked for together.
   */
  readonly answer: (steps: readonly Step[]) => Promise<readonly (Uci | undefined)[]>;
}

export interface Walk {
  readonly tree: Node<PgnNodeData>;
  /** How many positions on the learner's turn the walk reached. */
  readonly learnerTurns: number;
  /** The learner's positions left with no move. */
  readonly open: readonly Step[];
}

/** The number of the learner's next move, at `ply` plies from the start or after. */
export const nextLearnerMove = (side: Lesson['side'], ply: number) =>
  (side === 'white' ? Math.ceil(ply / 2) : Math.floor(ply / 2)) + 1;

/**
 * Plays `start` (SAN), then walks breadth first: the opponent's moves on their
 * turn, the learner's book moves on theirs, and `answer`'s move where the
 * lesson has none. Each position is walked once, and every line ends before
 * the learner's move after `moves`.
 */
export async function walk(start: readonly string[], players: Players): Promise<Walk> {
  const { learner, moves, opponent, answer } = players;
  const tree = new Node<PgnNodeData>();
  let first: Step = { pos: Chess.default(), line: [], ucis: [], node: tree };
  for (const san of start) first = advance(first, sanToUci(first.pos, san)!);
  const seen = new Set<string>();
  const open: Step[] = [];
  let learnerTurns = 0;
  for (let frontier = [first]; frontier.length;) {
    const next: Step[] = [];
    const unbooked: Step[] = [];
    for (const step of frontier) {
      const key = positionKey(step.pos);
      if (nextLearnerMove(learner.side, step.line.length) > moves) continue;
      if (seen.has(key) || step.pos.isEnd()) continue;
      seen.add(key);
      if (step.pos.turn !== learner.side) {
        for (const uci of await opponent(step)) next.push(advance(step, uci));
        continue;
      }
      learnerTurns++;
      const book = learner.positions[key]?.moves.filter((move) => move.book) ?? [];
      if (book.length) for (const { uci } of book) next.push(advance(step, uci));
      else unbooked.push(step);
    }
    const answers = await answer(unbooked);
    unbooked.forEach((step, i) => {
      const uci = answers[i];
      if (uci) next.push(advance(step, uci));
      else open.push(step);
    });
    frontier = next;
  }
  return { tree, learnerTurns, open };
}

/** `step` after `uci`, with the move added to the tree. */
function advance(step: Step, uci: Uci): Step {
  const pos = step.pos.clone();
  const san = playMove(pos, uci)!.san;
  const node = new ChildNode<PgnNodeData>({ san });
  step.node.children.push(node);
  return { pos, line: [...step.line, san], ucis: [...step.ucis, uci], node };
}

/** Adds `from`'s moves to `into` where it lacks them, after its own at each position. */
export function mergeTrees(into: Node<PgnNodeData>, from: Node<PgnNodeData>): void {
  for (const child of from.children) {
    const same = into.children.find(({ data }) => data.san === child.data.san);
    if (same) mergeTrees(same, child);
    else into.children.push(child);
  }
}

/** The tree as one PGN game, its first move at each position the main line. */
export const pgnOf = (tree: Node<PgnNodeData>, headers: Readonly<Record<string, string>>) =>
  makePgn({ headers: new Map(Object.entries({ ...headers, Result: '*' })), moves: tree });
