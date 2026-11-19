/**
 * The lesson screen's wiring: a game against the guide-first opponent, the
 * facts about the position on the board, what the learner points at (a
 * candidate, by its list row or a board square, and a note on the idea
 * card), an idea playing back, the mode (Explore or Practice), and the
 * board. With auto play the learner moves their own side; with auto play
 * off, either.
 */
import { useController } from '@data-client/react';
import { useIsFocused } from 'expo-router';
import { useEffect, useMemo, useReducer } from 'react';

import type { Square } from '@/board/drawing';
import type { BoardProps } from '@/components/Board';
import { parsePositionKey, toUci } from '@/game/replay';
import { useGame } from '@/game/useGame';
import { gameOpponent } from '@/resources/opponent';
import { useSettings } from '@/settings/SettingsProvider';
import { useNeedsStockfish } from '@/stockfish/demand';

import { boardPress, lessonBoard } from './board';
import { ideaPlayback } from './drawings';
import { guidance, type LessonMode, notePlayback, type PlayedBack } from './guidance';
import type { Lesson, Note, Uci } from './lesson';
import { lessonOpponent } from './opponent';
import { beforeSideMoves } from './practice';
import { initialScreen, screenReducer } from './screen';
import { bookMoves, type Candidate, isBook } from './select';
import { lessonView, type Pointer, preview, type ShownNote } from './view';

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
  const settings = useSettings();
  const { opponent } = settings;
  const focused = useIsFocused();
  // Moves are labelled by Stockfish whatever judges the bar: Maia's judgement
  // could call a book move a mistake. So Stockfish runs while this is in front.
  useNeedsStockfish(focused);
  // With auto play off nobody replies: the learner picks the opponent's move.
  const rival = settings.auto
    ? lessonOpponent(lesson, opponent, gameOpponent(ctrl, opponent))
    : undefined;
  const game = useGame(rival, {
    side: lesson.side,
    active: focused,
    judge: 'stockfish',
    book: (line) => bookMoves(lesson, line),
  });
  const { moves, ply, plies, current, canMove } = game;
  // A move played before the learner's first starts a Practice run.
  const startsRun = beforeSideMoves(plies, lesson.side, ply);
  const view = useMemo(
    () => lessonView({ lesson, line: moves, ply, opponent }),
    [lesson, moves, ply, opponent],
  );
  // A row that leaves the list (played, or stepped away from) never reports
  // a hover-out or blur, so a peek ends when the board moves on; otherwise
  // stepping back would preview that row again.
  const [{ mode: modeState, peek }, dispatch] = useReducer(screenReducer, initialScreen);
  const { mode } = modeState;
  const { key } = view;
  if (peek && peek.key !== key) dispatch({ type: 'board', key });
  const here = peek?.key === key ? peek : undefined;
  const playing = here?.kind === 'play' ? here : undefined;
  // A playback plays in its candidate's position, wherever the pointer goes.
  const pointer = playing ? playing.from : here?.candidate;
  const shown = guidance({
    view,
    mode,
    switches: settings,
    preview: pointer && preview(lesson, view, pointer),
    pointed: here?.note,
    playing: playing?.played,
  });
  const frames = shown.playing
    ? ideaPlayback(shown.playing.idea, parsePositionKey(shown.playing.at)!)
    : [];
  // An idea the guidance no longer shows (the mode or a switch changed) stops,
  // or its peek would hold the board with no controls to end it.
  if (playing && !shown.playing) dispatch({ type: 'stop' });
  const frame = playing && frames[playing.step];
  const stepping = playing?.auto && playing.step < frames.length - 1;
  useEffect(() => {
    if (!stepping) return;
    const timer = setTimeout(() => dispatch({ type: 'step' }), PLAYBACK_STEP_MS);
    return () => clearTimeout(timer);
  }, [stepping, playing?.step, playing?.played]);

  // A square under the mouse or a finger previews the candidate there. A
  // square without one ends any preview, as leaving the board does; it is
  // kept as no pointer, so moving on over such squares re-renders nothing.
  const pointSquare = (square: Square | null) => {
    const at: Pointer | undefined = square ? { at: 'square', square } : undefined;
    const candidate = at && preview(lesson, view, at) ? at : undefined;
    dispatch({ type: 'candidate', key, candidate });
  };
  // One event for a move: the game plays it, and the mode learns what it was.
  const playMove = (uci: string) => {
    if (!canMove) return;
    const learner = current.turn === lesson.side;
    const book = isBook(lesson, key, uci);
    dispatch({ type: 'played', learner, book, first: startsRun, replaces: ply < moves.length });
    game.play(uci);
  };
  const play = (candidate: Candidate) => playMove(candidate.move.uci);
  const board: Omit<BoardProps, 'dom'> = {
    ...lessonBoard({
      side: lesson.side,
      key,
      guidance: shown,
      current,
      canMove,
      quality: game.quality,
      frame,
    }),
    onMove: (from, to) => playMove(toUci(current, from, to)),
    onHover: pointSquare,
    onHold: pointSquare,
    onPress: (square, selected) => {
      const press = !frame && boardPress(shown, current, canMove, square, selected);
      if (press === 'end') dispatch({ type: 'candidate', key });
      else if (press) play(press);
    },
  };
  // The opponent's reply would move the board on and end a playback at once,
  // so none starts while one is on its way to the position shown.
  const playable = (note: ShownNote) =>
    game.replying ? undefined : notePlayback(shown.playable, note.note)?.idea.type;
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
    /** Whether the learner may play the side to move's candidates now. */
    canPlay: canMove,
    play,
    /** Explore, or Practice with whether the run is clean. */
    modeState,
    /** A move played on the board now starts a Practice run: no move of the learner's comes before. */
    startsRun,
    /** The learner chooses Explore or Practice. */
    chooseMode: (mode: LessonMode) =>
      dispatch({ type: 'modeChosen', mode, untouched: !game.started }),
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
