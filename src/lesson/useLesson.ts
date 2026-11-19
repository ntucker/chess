/**
 * The lesson screen's wiring: a game against the guide-first opponent, the
 * facts about the position on the board, the move the learner's pointer
 * previews, an idea playing back, and what the board draws. Explore only so
 * far, with the opponent replying by itself.
 */
import { useController } from '@data-client/react';
import { useIsFocused } from 'expo-router';
import { useEffect, useEffectEvent, useMemo, useState } from 'react';

import { lastMoveBadge } from '@/board/drawing';
import type { BoardProps } from '@/components/Board';
import { lastPosition, parsePositionKey } from '@/game/replay';
import { useGame } from '@/game/useGame';
import { gameOpponent } from '@/resources/opponent';
import { useSettings } from '@/settings/SettingsProvider';

import { ideaPlayback, lessonDrawings, notePlayback, type PlayedBack } from './drawings';
import { guidance, type LessonSwitches } from './guidance';
import type { Lesson, Note, PositionKey, Uci } from './lesson';
import { lessonOpponent } from './opponent';
import type { Candidate } from './select';
import { lessonView, preview, type ShownNote } from './view';

/** Explore with the opponent replying and ideas drawn, until the screen offers switches. */
const SWITCHES: LessonSwitches = {
  auto: true,
  showIdeas: true,
  showTraps: false,
};

/** How long each board of a playback shows before the next. */
const PLAYBACK_STEP_MS = 1100;

/** An idea playing back on the board: its note on the idea card, and the board it is on. */
export interface Playing {
  readonly note: Note;
  /** Which board: 0 is where the idea starts. */
  readonly step: number;
  /** How many boards it steps through. */
  readonly steps: number;
}

/** The idea card's play-through controls (see `ideaPlayback`). */
export interface Playback {
  readonly playing?: Playing;
  /** Which kind of idea of `note` plays back, if any. */
  readonly playable: (note: ShownNote) => PlayedBack['type'] | undefined;
  /** Plays `note`'s idea from its start, one board after another. */
  readonly play: (note: ShownNote) => void;
  /** Shows the playing idea's board `step`, and stops stepping by itself. */
  readonly goto: (step: number) => void;
  readonly stop: () => void;
}

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
  // pointed at in. A row that leaves the list (played, or stepped away from)
  // never reports a hover-out or blur, so the pointer ends when the board
  // moves on; otherwise stepping back would preview that row again.
  const [pointer, setPointer] = useState<{ readonly key: PositionKey; readonly uci: Uci }>();
  if (pointer && pointer.key !== view.key) setPointer(undefined);
  const pointed = pointer?.key === view.key ? pointer.uci : undefined;
  // The note whose idea plays back, the position it was started in, and the
  // row pointed at then, if any. It ends, like the pointer, once the board
  // moves on. While it plays, the board is its own: the preview it started
  // from stays, so the note stays on the card, and no other is previewed.
  const [started, setStarted] = useState<{
    readonly key: PositionKey;
    readonly note: Note;
    readonly row?: Uci;
    readonly step: number;
    /** It steps by itself until the learner steps it. */
    readonly auto: boolean;
  }>();
  if (started && started.key !== view.key) setStarted(undefined);
  const playing = started?.key === view.key ? started : undefined;
  const row = playing ? playing.row : pointed;
  const shown = guidance({
    view,
    mode: 'explore',
    switches: SWITCHES,
    preview: row === undefined ? undefined : preview(lesson, view, { at: 'row', uci: row }),
  });
  const played = playing && shown.notes.find(({ note }) => note === playing.note);
  const idea = played && notePlayback(shown, played);
  const frames = idea ? ideaPlayback(idea.idea, parsePositionKey(idea.at)!) : [];
  const frame = playing && frames[playing.step];
  const stepping = playing?.auto && playing.step < frames.length - 1;
  useEffect(() => {
    if (!stepping) return;
    const timer = setTimeout(
      () => setStarted((now) => now && { ...now, step: now.step + 1 }),
      PLAYBACK_STEP_MS,
    );
    return () => clearTimeout(timer);
  }, [stepping, playing?.step]);
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
  // A playback's boards aren't games: nothing moves on them and nothing is drawn.
  const boardProps: Omit<BoardProps, 'dom'> = {
    fen: frame?.fen ?? board.fen,
    orientation: lesson.side,
    turnColor: board.turn,
    movableColor: canMove && !previewed && !frame ? lesson.side : undefined,
    dests: frame ? {} : board.dests,
    lastMove: frame ? frame.move : board.move && [board.move.from, board.move.to],
    drawings: frame
      ? []
      : [
          ...lessonDrawings(shown, slid ? slid.next : view.key, lesson.side),
          ...lastMoveBadge(previewed ? undefined : current.move?.to, game.qualities[ply - 1]),
        ],
    check: !frame && board.check,
    onMove: game.move,
  };
  const playback: Playback = {
    playing: playing && frame && { note: playing.note, step: playing.step, steps: frames.length },
    playable: (note) => notePlayback(shown, note)?.idea.type,
    play: (note) => setStarted({ key: view.key, note: note.note, row: pointed, step: 0, auto: true }),
    goto: (step) => setStarted((now) => now && { ...now, step, auto: false }),
    stop: () => setStarted(undefined),
  };

  return {
    game,
    opponent,
    view,
    guidance: shown,
    board: boardProps,
    playback,
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
