/**
 * What the lesson's board shows: the game's position, with a previewed move
 * drawn played over it, or a board of an idea playing back, with guidance's
 * drawings.
 * Whether the learner points at a candidate list row or drags a piece over
 * a square, the preview comes from `preview` (./view.ts) through guidance,
 * so both show a candidate the same way.
 */
import type { Square } from '@/board/drawing';
import { lastMoveBadge } from '@/board/drawing';
import type { BoardProps } from '@/components/Board';
import type { MoveQuality } from '@/analysis/quality';
import type { Color, Position } from '@/game/replay';

import { lessonDrawings, type PlaybackFrame, slidCandidate } from './drawings';
import type { Guidance } from './guidance';
import type { PositionKey } from './lesson';
import type { Candidate } from './select';
import { shownKey } from './view';

interface LessonBoardInput {
  /** The learner's side, at the bottom of the board. */
  readonly side: Color;
  /** The game's position on the board (`LessonView.key`), as guidance's drawings name it. */
  readonly key: PositionKey;
  readonly guidance: Guidance;
  /** The same position played out: its FEN, turn and legal moves. */
  readonly current: Position;
  /** Whether the learner may move on `current` now, for the side to move. */
  readonly canMove: boolean;
  /** The label of the move that led to `current`, once it's judged. */
  readonly quality?: MoveQuality;
  /** The board of the idea playing back, which replaces the game's. */
  readonly frame?: PlaybackFrame;
}

/** The board's props, all but its callbacks. */
export type LessonBoard = Omit<BoardProps, 'dom' | 'onMove' | 'onDrag' | 'onPress'>;

/**
 * The board for a lesson. A sliding preview draws the position after its
 * move over the game's, which stays movable underneath, so every press and
 * drag plays on the game. A playback's boards aren't games: nothing moves on
 * them and nothing is drawn.
 */
export function lessonBoard({
  side,
  key,
  guidance,
  current,
  canMove,
  quality,
  frame,
}: LessonBoardInput): LessonBoard {
  const slid = slidCandidate(guidance);
  const shown = frame ?? current;
  return {
    fen: shown.fen,
    orientation: side,
    turnColor: shown.turn,
    movableColor: canMove && !frame ? current.turn : undefined,
    dests: frame ? {} : current.dests,
    lastMove: shown.move && [shown.move.from, shown.move.to],
    preview: frame || !slid ? undefined : slid.next,
    drawings: frame
      ? []
      : [
          ...lessonDrawings(guidance, shownKey(key, guidance.preview), side),
          ...lastMoveBadge(slid ? undefined : current.move?.to, quality),
        ],
    check: shown.check,
  };
}

/**
 * What a press on `square` does to a sliding preview, while the game is at
 * `current`: a press where the preview shows its piece plays the preview's
 * candidate, unless the board plays the press itself, as the move of a piece
 * picked before it (`selected`), so no move is played twice. Any other press
 * `'end'`s the preview, and the board handles it as usual. Example:
 * previewing Bf5, a click on f5 plays Bf5, and a click on any other square
 * ends the preview, so a finger, which never hovers off it, gets back to the
 * game. Without a sliding preview, nothing.
 */
export function boardPress(
  guidance: Guidance,
  current: Position,
  canMove: boolean,
  square: Square,
  selected?: Square,
): Candidate | 'end' | undefined {
  const slid = slidCandidate(guidance);
  if (!slid) return undefined;
  const boardPlays = selected !== undefined && current.dests[selected]?.includes(square);
  return canMove && !boardPlays && slid.to === square ? slid : 'end';
}
