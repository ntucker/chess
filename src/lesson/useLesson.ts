/**
 * The lesson screen's wiring: a game against the guide-first opponent, the
 * facts about the position on the board, the move the learner's pointer
 * previews, and what the board draws. Explore only so far, with the opponent
 * replying by itself.
 */
import { useController } from '@data-client/react';
import { useIsFocused } from 'expo-router';
import { useEffect, useEffectEvent, useMemo, useState } from 'react';

import { lastMoveBadge } from '@/board/drawing';
import type { BoardProps } from '@/components/Board';
import { lastPosition } from '@/game/replay';
import { useGame } from '@/game/useGame';
import { gameOpponent } from '@/resources/opponent';
import { useSettings } from '@/settings/SettingsProvider';

import { lessonDrawings } from './drawings';
import { guidance, type LessonSwitches } from './guidance';
import type { Lesson, PositionKey, Uci } from './lesson';
import { lessonOpponent } from './opponent';
import type { Candidate } from './select';
import { lessonView, preview } from './view';

/** Explore with the opponent replying and ideas drawn, until the screen offers switches. */
const SWITCHES: LessonSwitches = {
  auto: true,
  showIdeas: true,
  showTraps: false,
};

export function useLesson(lesson: Lesson) {
  const ctrl = useController();
  const { opponent } = useSettings();
  const game = useGame(lessonOpponent(lesson, opponent, gameOpponent(ctrl, opponent)));
  const { line, ply, current } = game;
  const view = useMemo(
    () => lessonView({ lesson, line, ply, opponent }),
    [lesson, line, ply, opponent],
  );
  // The candidate list row the learner points at, and the position it was
  // pointed at in: once the board moves on, it points at nothing.
  const [pointer, setPointer] = useState<{ readonly key: PositionKey; readonly uci: Uci }>();
  const pointed = pointer?.key === view.key ? pointer.uci : undefined;
  const shown = guidance({
    view,
    mode: 'explore',
    switches: SWITCHES,
    preview: pointed === undefined ? undefined : preview(lesson, view, { at: 'row', uci: pointed }),
  });
  const slid = shown.preview?.slide ? shown.preview.candidate : undefined;
  const previewed = slid && lastPosition([...line.slice(0, ply), slid.move.uci]);
  // useGame starts as White with nothing asked; the lesson's side decides.
  const ready = game.playerColor === lesson.side;
  const canMove = ready && game.canMove;

  // The opponent's first move, when the learner plays Black, is asked only
  // once this screen is in front.
  const focused = useIsFocused();
  const start = useEffectEvent(() => {
    if (!ready && !line.length) game.newGame(lesson.side);
  });
  useEffect(() => {
    if (focused) start();
  }, [focused]);

  const board = previewed ?? current;
  const boardProps: Omit<BoardProps, 'dom'> = {
    fen: board.fen,
    orientation: lesson.side,
    turnColor: board.turn,
    movableColor: canMove && !previewed ? lesson.side : undefined,
    dests: board.dests,
    lastMove: board.move ? [board.move.from, board.move.to] : undefined,
    drawings: [
      ...lessonDrawings(shown, slid ? slid.next : view.key),
      ...lastMoveBadge(previewed ? undefined : current.move?.to, game.qualities[ply - 1]),
    ],
    check: board.check,
    onMove: game.move,
  };

  return {
    game,
    opponent,
    view,
    guidance: shown,
    board: boardProps,
    /** Whether the learner may play the candidates now (they are the side to move's). */
    canPlay: canMove,
    play: (candidate: Candidate) => game.play(candidate.move.uci),
    /** The candidate list row the learner points at. */
    pointed,
    /** The learner points at a candidate list row, or at none. */
    point: (uci: Uci | undefined) =>
      setPointer(uci === undefined ? undefined : { key: view.key, uci }),
  };
}
