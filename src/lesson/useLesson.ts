/**
 * The lesson screen's wiring: a game against the guide-first opponent, the
 * facts about the position on the board, what the learner points at (a
 * candidate, by its list row or a board square, and a note on the idea
 * card), an idea playing back, and the board. Explore only so far, with the
 * opponent replying by itself.
 */
import { useController } from '@data-client/react';
import { useIsFocused } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';

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
import type { Lesson, Note, PositionKey } from './lesson';
import { lessonOpponent } from './opponent';
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

/** What the learner points at, in the position it was pointed at in. */
interface Pointing {
  readonly key: PositionKey;
  readonly candidate?: Pointer;
  readonly note?: Note;
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
  // a hover-out or blur, so pointing ends when the board moves on; otherwise
  // stepping back would preview that row again.
  const [pointing, setPointing] = useState<Pointing>();
  if (pointing && pointing.key !== view.key) setPointing(undefined);
  const pointed = pointing?.key === view.key ? pointing : undefined;
  const pointAt = (change: (now: Pointing) => Omit<Pointing, 'key'>) =>
    setPointing((now) => ({
      key: view.key,
      ...change(now?.key === view.key ? now : { key: view.key }),
    }));
  // The note whose idea plays back, the position it was started in, and the
  // candidate pointed at then, if any. It ends, like pointing, once the board
  // moves on. While it plays, the board is its own: the preview it started
  // from stays, so the note stays on the card, and no other is previewed.
  const [started, setStarted] = useState<{
    readonly key: PositionKey;
    readonly note: Note;
    readonly pointer?: Pointer;
    readonly step: number;
    /** It steps by itself until the learner steps it. */
    readonly auto: boolean;
  }>();
  if (started && started.key !== view.key) setStarted(undefined);
  const playing = started?.key === view.key ? started : undefined;
  const pointer = playing ? playing.pointer : pointed?.candidate;
  const shown = guidance({
    view,
    mode: 'explore',
    switches: SWITCHES,
    preview: pointer && preview(lesson, view, pointer),
    pointed: pointed?.note,
    playing: playing?.note,
  });
  const frames = shown.playing
    ? ideaPlayback(shown.playing.idea, parsePositionKey(shown.playing.at)!)
    : [];
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

  // A square under the mouse or a finger previews; leaving the board ends
  // only a preview pointed at from the board.
  const pointSquare = (square: Square | null) =>
    pointAt((now) =>
      square
        ? { ...now, candidate: { at: 'square', square } }
        : { ...now, candidate: now.candidate?.at === 'square' ? undefined : now.candidate },
    );
  const play = (candidate: Candidate) => game.play(candidate.move.uci);
  const board: Omit<BoardProps, 'dom'> = {
    ...lessonBoard({
      side: lesson.side,
      view,
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
    playing: playing && frame && { note: playing.note, step: playing.step, steps: frames.length },
    playable,
    // From the preview on screen, which a playing note keeps after the pointer leaves.
    play: (note) => {
      if (playable(note)) {
        setStarted({ key: view.key, note: note.note, pointer, step: 0, auto: true });
      }
    },
    goto: (step) => setStarted((now) => now && { ...now, step, auto: false }),
    stop: () => setStarted(undefined),
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
    pointedNote: pointed?.note,
    /**
     * The learner points at a candidate list row. Leaving a row keeps its
     * preview, so the learner can move on to its notes; `leave` ends it.
     */
    pointRow: (uci: Candidate['move']['uci']) =>
      pointAt((now) => ({ ...now, candidate: { at: 'row', uci } })),
    /** The learner points at a note on the idea card, or at none. */
    pointNote: (note: Note | undefined) => pointAt((now) => ({ ...now, note })),
    /** The learner leaves the candidates and the idea card: their previews end. */
    leave: () => setPointing(undefined),
  };
}
