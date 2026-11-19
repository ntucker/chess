/**
 * What the lesson's board shows: the game's position, a previewed move shown
 * played, or a board of an idea playing back, with guidance's drawings.
 * Whether the learner points at a candidate list row or at a board square,
 * the preview comes from `preview` (./view.ts) through guidance, so both
 * pointers show a candidate the same way.
 */
import type { Square } from '@/board/drawing';
import { lastMoveBadge } from '@/board/drawing';
import type { BoardProps } from '@/components/Board';
import type { MoveQuality } from '@/analysis/quality';
import { type Color, lastPosition, type Position } from '@/game/replay';

import { lessonDrawings, type PlaybackFrame, slidCandidate } from './drawings';
import type { Guidance } from './guidance';
import type { PositionKey, Uci } from './lesson';
import type { Candidate } from './select';
import { shownKey } from './view';

interface LessonBoardInput {
  /** The learner's side, at the bottom of the board. */
  readonly side: Color;
  /** The game's position on the board (`LessonView.key`). */
  readonly key: PositionKey;
  readonly guidance: Guidance;
  /** The game's moves, and how many of them the board shows. */
  readonly moves: readonly Uci[];
  readonly ply: number;
  /** The game's position after `moves.slice(0, ply)`. */
  readonly current: Position;
  /** Whether the learner may move on `current` now. */
  readonly canMove: boolean;
  /** The label of the move that led to `current`, once it's judged. */
  readonly quality?: MoveQuality;
  /** The board of the idea playing back, which replaces the game's. */
  readonly frame?: PlaybackFrame;
}

/** The board's props, all but its callbacks. */
export type LessonBoard = Omit<BoardProps, 'dom' | 'onMove' | 'onHover' | 'onHold' | 'onPress'>;

/**
 * The board for a lesson. A sliding preview shows the position after its
 * move, which can't be moved on: chessground would refuse the move it shows
 * played, so a press on its square plays it instead (`pressedCandidate`). A
 * playback's boards aren't games: nothing moves on them and nothing is drawn.
 */
export function lessonBoard({
  side,
  key,
  guidance,
  moves,
  ply,
  current,
  canMove,
  quality,
  frame,
}: LessonBoardInput): LessonBoard {
  const slid = slidCandidate(guidance);
  const previewed = slid && lastPosition([...moves.slice(0, ply), slid.move.uci]);
  const board = previewed ?? current;
  const shown = frame ?? board;
  return {
    fen: shown.fen,
    orientation: side,
    turnColor: shown.turn,
    movableColor: canMove && !previewed && !frame ? side : undefined,
    dests: frame ? {} : board.dests,
    lastMove: shown.move && [shown.move.from, shown.move.to],
    drawings: frame
      ? []
      : [
          ...lessonDrawings(guidance, shownKey(key, guidance.preview), side),
          ...lastMoveBadge(previewed ? undefined : current.move?.to, quality),
        ],
    check: shown.check,
  };
}

/**
 * The candidate a press on `square` plays: a sliding preview's, pressed where
 * its piece now stands. Elsewhere the board plays moves itself.
 */
export function pressedCandidate(guidance: Guidance, square: Square): Candidate | undefined {
  const slid = slidCandidate(guidance);
  return slid?.to === square ? slid : undefined;
}
