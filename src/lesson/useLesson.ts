/**
 * The lesson screen's wiring: a game against the guide-first opponent, the
 * facts about the position on the board, what the learner points at (a
 * candidate, by its list row or a board square, and a note on the idea
 * card), an idea playing back, and the board. Explore only so far, with the
 * opponent replying by itself.
 */
import { useController } from '@data-client/react';
import { useIsFocused } from 'expo-router';
import { useEffect, useMemo, useReducer } from 'react';

import type { Square } from '@/board/drawing';
import type { BoardProps } from '@/components/Board';
import { parsePositionKey } from '@/game/replay';
import { useGame } from '@/game/useGame';
import { gameOpponent } from '@/resources/opponent';
import { useSettings } from '@/settings/SettingsProvider';
import { useNeedsStockfish } from '@/stockfish/demand';

import { lessonBoard, pressedCandidate } from './board';
import { ideaPlayback } from './drawings';
import { guidance, type LessonSwitches, notePlayback, type PlayedBack } from './guidance';
import type { Lesson, Note, Uci } from './lesson';
import { lessonOpponent } from './opponent';
import { peekReducer } from './peek';
import type { Candidate } from './select';
import { lessonView, type Pointer, preview, type ShownNote } from './view';

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
  /** The idea of `note` the boards play. */
  readonly idea: PlayedBack;
  /** Which board: 0 is where the idea starts. */
  readonly step: number;
  /** How many boards it steps through. */
  readonly steps: number;
}

/** The idea card's play-through controls (see `ideaPlayback`). */
export interface Playback {
  readonly playing?: Playing;
  /** Which kind of idea of `note` can play back now, if any. */
  readonly playable: (note: ShownNote) => PlayedBack['type'] | undefined;
  /** Plays `note`'s idea from its start, one board after another; nothing unless `playable`. */
  readonly play: (note: ShownNote) => void;
  /** Shows the playing idea's board `step`, and stops stepping by itself. */
  readonly goto: (step: number) => void;
  readonly stop: () => void;
}

export function useLesson(lesson: Lesson) {
  const ctrl = useController();
  const { opponent } = useSettings();
  const focused = useIsFocused();
  // Moves are labelled by Stockfish whatever judges the bar: Maia's judgement
  // could call a book move a mistake. So Stockfish runs while this is in front.
  useNeedsStockfish(focused);
  const game = useGame(lessonOpponent(lesson, opponent, gameOpponent(ctrl, opponent)), {
    side: lesson.side,
    active: focused,
    judge: 'stockfish',
  });
  const { moves, ply, current } = game;
  const view = useMemo(
    () => lessonView({ lesson, line: moves, ply, opponent }),
    [lesson, moves, ply, opponent],
  );
  // A row that leaves the list (played, or stepped away from) never reports
  // a hover-out or blur, so a peek ends when the board moves on; otherwise
  // stepping back would preview that row again.
  const [peek, dispatch] = useReducer(peekReducer, undefined);
  const { key } = view;
  if (peek && peek.key !== key) dispatch({ type: 'board', key });
  const here = peek?.key === key ? peek : undefined;
  const playing = here?.kind === 'play' ? here : undefined;
  const pointer = here?.candidate;
  const shown = guidance({
    view,
    mode: 'explore',
    switches: SWITCHES,
    preview: pointer && preview(lesson, view, pointer),
    pointed: here?.note,
    playing: playing?.played,
  });
  const frames = shown.playing
    ? ideaPlayback(shown.playing.idea, parsePositionKey(shown.playing.at)!)
    : [];
  const frame = playing && frames[playing.step];
  const stepping = playing?.auto && playing.step < frames.length - 1;
  useEffect(() => {
    if (!stepping) return;
    const timer = setTimeout(() => dispatch({ type: 'step' }), PLAYBACK_STEP_MS);
    return () => clearTimeout(timer);
  }, [stepping, playing?.step]);

  // A square under the mouse or a finger previews the candidate there. A
  // square without one ends any preview, as leaving the board does; it is
  // kept as no pointer, so moving on over such squares re-renders nothing.
  const pointSquare = (square: Square | null) => {
    const at: Pointer | undefined = square ? { at: 'square', square } : undefined;
    const candidate = at && preview(lesson, view, at) ? at : undefined;
    dispatch({ type: 'candidate', key, candidate });
  };
  const play = (candidate: Candidate) => game.play(candidate.move.uci);
  const board: Omit<BoardProps, 'dom'> = {
    ...lessonBoard({
      side: lesson.side,
      key,
      guidance: shown,
      moves,
      ply,
      current,
      canMove: game.canMove,
      quality: game.quality,
      frame,
    }),
    onMove: game.move,
    onHover: pointSquare,
    onHold: pointSquare,
    onPress: (square) => {
      const pressed = !frame && game.canMove && pressedCandidate(shown, square);
      if (pressed) play(pressed);
    },
  };
  // The opponent's reply would move the board on and end a playback at once,
  // so none starts while one is on its way to the position shown.
  const playable = (note: ShownNote) =>
    game.replying ? undefined : notePlayback(shown.ideas, note.note)?.idea.type;
  const playback: Playback = {
    playing: shown.playing &&
      playing &&
      frame && {
        note: playing.played,
        idea: shown.playing.idea,
        step: playing.step,
        steps: frames.length,
      },
    playable,
    // From the preview on screen, which stays while the idea plays.
    play: (note) => {
      if (playable(note)) dispatch({ type: 'play', key, note: note.note });
    },
    goto: (step) => dispatch({ type: 'goto', step }),
    stop: () => dispatch({ type: 'stop' }),
  };

  return {
    game,
    opponent,
    view,
    guidance: shown,
    board,
    playback,
    /** Whether the learner may play the candidates now (they are the side to move's). */
    canPlay: game.canMove,
    play,
    /** The note pointed at on the idea card. */
    pointedNote: shown.pointed,
    /**
     * The learner points at a candidate list row. Leaving a row keeps its
     * preview, so the learner can move on to its notes; `leave` ends it.
     */
    pointRow: (uci: Uci) => dispatch({ type: 'candidate', key, candidate: { at: 'row', uci } }),
    /** The learner points at a note on the idea card, or at none. */
    pointNote: (note: Note | undefined) => dispatch({ type: 'note', key, note }),
    /** The learner lets a note on the idea card go: the mouse leaves it, or a second tap. */
    leaveNote: (note: Note) => dispatch({ type: 'leaveNote', key, note }),
    /** The learner leaves the candidates and the idea card: their previews end. */
    leave: () => dispatch({ type: 'leave' }),
  };
}
