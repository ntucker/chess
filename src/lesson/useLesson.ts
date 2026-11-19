/**
 * The lesson screen's wiring: a game against the guide-first opponent, the
 * facts about the position on the board, what the learner's pointer
 * previews, and what the board draws. First cut, from the thin lesson
 * slice: Explore only, with the opponent replying by itself; piece C2
 * grows it into the full screen.
 */
import { useController } from "@data-client/react";
import { useIsFocused } from "expo-router";
import { useEffect, useEffectEvent, useMemo, useState } from "react";

import { lastMoveBadge } from "@/board/drawing";
import type { BoardProps } from "@/components/Board";
import { analyze, replay } from "@/game/replay";
import { useGame } from "@/game/useGame";
import { gameOpponent } from "@/resources/opponent";
import { useSettings } from "@/settings/SettingsProvider";

import { lessonDrawings } from "./drawings";
import { guidance, type LessonSwitches } from "./guidance";
import type { Lesson, Uci } from "./lesson";
import { lessonOpponent } from "./opponent";
import type { Candidate } from "./select";
import { lessonView, preview } from "./view";

/** The thin slice's switches, fixed until the screen grows its own. */
const SWITCHES: LessonSwitches = {
  auto: true,
  showIdeas: true,
  showTraps: false,
};

export function useLesson(lesson: Lesson) {
  const ctrl = useController();
  const { opponent } = useSettings();
  const game = useGame(
    lessonOpponent(lesson, opponent, gameOpponent(ctrl, opponent)),
  );
  const { line, ply, current } = game;
  const view = useMemo(
    () => lessonView({ lesson, line, ply, opponent }),
    [lesson, line, ply, opponent],
  );
  /** The candidate list row the learner points at. */
  const [pointed, setPointed] = useState<Uci>();
  const shown = guidance({
    view,
    mode: "explore",
    switches: SWITCHES,
    preview:
      pointed === undefined
        ? undefined
        : preview(lesson, view, { at: "row", uci: pointed }),
  });
  const slid = shown.preview?.slide ? shown.preview.candidate : undefined;
  const previewed =
    slid && analyze(replay([...line.slice(0, ply), slid.move.uci]).at(-1)!);
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
  const boardProps: Omit<BoardProps, "dom"> = {
    fen: board.fen,
    orientation: lesson.side,
    turnColor: board.turn,
    movableColor: canMove && !previewed ? lesson.side : undefined,
    dests: board.dests,
    lastMove: board.move ? [board.move.from, board.move.to] : undefined,
    drawings: [
      ...lessonDrawings(shown, slid ? slid.next : view.key),
      ...lastMoveBadge(
        previewed ? undefined : current.move?.to,
        game.qualities[ply - 1],
      ),
    ],
    check: board.check,
    onMove: game.move,
  };

  return {
    game,
    view,
    guidance: shown,
    board: boardProps,
    /** Whether the learner may play `candidate` now. */
    canPlay: (candidate: Candidate) =>
      canMove && candidate.piece.color === lesson.side,
    play(candidate: Candidate) {
      setPointed(undefined);
      game.move(candidate.from, candidate.to);
    },
    /** The candidate list row the learner points at. */
    pointed,
    /** The learner points at a candidate list row, or at none. */
    point: setPointed,
  };
}
