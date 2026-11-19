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
import type { Lesson, Note, PositionKey, Uci } from './lesson';
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

/**
 * What the board shows beyond the game, one at a time: what the learner
 * points at, or a note's idea playing back from the pointing it started from.
 * While an idea plays the board is its own, so pointing waits; stopping goes
 * back to the pointing it started from.
 */
type Peek =
  | (Pointing & { readonly kind: 'point' })
  | (Pointing & {
      readonly kind: 'play';
      readonly note: Note;
      readonly step: number;
      /** It steps by itself until the learner steps it. */
      readonly auto: boolean;
    });

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
  const [peek, setPeek] = useState<Peek>();
  if (peek && peek.key !== view.key) setPeek(undefined);
  const here = peek?.key === view.key ? peek : undefined;
  const playing = here?.kind === 'play' ? here : undefined;
  const pointer = here?.candidate;
  // Pointing that changes nothing keeps the same state, so nothing re-renders.
  const pointAt = (change: (now: Pointing) => Pointing) =>
    setPeek((now) => {
      const at: Peek = now?.key === view.key ? now : { kind: 'point', key: view.key };
      if (at.kind === 'play') return now;
      const next = change(at);
      return samePointing(at, next) ? now : { ...next, kind: 'point' };
    });
  const changePlayback = (change: (now: Extract<Peek, { kind: 'play' }>) => Peek) =>
    setPeek((now) => (now?.kind === 'play' ? change(now) : now));
  const shown = guidance({
    view,
    mode: 'explore',
    switches: SWITCHES,
    preview: pointer && preview(lesson, view, pointer),
    pointed: here?.note,
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
      () => changePlayback((now) => ({ ...now, step: now.step + 1 })),
      PLAYBACK_STEP_MS,
    );
    return () => clearTimeout(timer);
  }, [stepping, playing?.step]);

  // A square under the mouse or a finger previews the candidate there. A
  // square without one ends any preview, as leaving the board does; it is
  // kept as no pointer, so moving on over such squares re-renders nothing.
  // Pointing at a candidate, by its square or its row, leaves the idea card's
  // note: the keyboard can move from a note to a row without leaving the panel.
  const pointSquare = (square: Square | null) => {
    const at: Pointer | undefined = square ? { at: 'square', square } : undefined;
    const previewing = at && preview(lesson, view, at) ? at : undefined;
    pointAt((now) =>
      previewing ? { key: now.key, candidate: previewing } : { ...now, candidate: undefined },
    );
  };
  const play = (candidate: Candidate) => game.play(candidate.move.uci);
  const board: Omit<BoardProps, 'dom'> = {
    ...lessonBoard({
      side: lesson.side,
      key: view.key,
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
    // From the preview on screen, which stays while the idea plays.
    play: (note) => {
      if (playable(note)) {
        const start = { key: view.key, candidate: pointer, note: note.note };
        setPeek({ ...start, kind: 'play', step: 0, auto: true });
      }
    },
    goto: (to) => changePlayback((now) => ({ ...now, step: to, auto: false })),
    stop: () =>
      changePlayback(({ key, candidate, note }) => ({ kind: 'point', key, candidate, note })),
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
    pointedNote: here?.note,
    /**
     * The learner points at a candidate list row. Leaving a row keeps its
     * preview, so the learner can move on to its notes; `leave` ends it.
     */
    pointRow: (uci: Uci) => pointAt(({ key }) => ({ key, candidate: { at: 'row', uci } })),
    /** The learner points at a note on the idea card, or at none. */
    pointNote: (note: Note | undefined) => pointAt((now) => ({ ...now, note })),
    /** The learner leaves the candidates and the idea card: their previews end. */
    leave: () => setPeek((now) => (now?.kind === 'play' ? now : undefined)),
  };
}

const samePointer = (a?: Pointer, b?: Pointer) =>
  a === b ||
  (a?.at === 'row' && b?.at === 'row' && a.uci === b.uci) ||
  (a?.at === 'square' && b?.at === 'square' && a.square === b.square);

const samePointing = (a: Pointing, b: Pointing) =>
  a.key === b.key && a.note === b.note && samePointer(a.candidate, b.candidate);
