/**
 * The lesson screen's wiring: a game against the guide-first opponent, the
 * facts about the position on the board, what the learner points at (a
 * candidate, by its list row or a piece dragged or clicked, and a note on
 * the idea card), an idea playing back, the mode (Explore or Practice),
 * the learner's progress marks, Stockfish's best move and top three in
 * Explore, and the board. Where the opponent plays its own moves (`opponentPlays`) the learner
 * moves their own side; elsewhere, either.
 */
import { useCache, useController, useFetch, useSuspense } from '@data-client/react';
import { useIsFocused } from 'expo-router';
import { useEffect, useMemo, useReducer } from 'react';

import type { Square } from '@/board/drawing';
import type { Drag } from '@/board/pointer';
import type { BoardProps } from '@/components/Board';
import { dropMove, parsePositionKey, pieceAt } from '@/game/replay';
import { type GameStore, useGame } from '@/game/useGame';
import { getEvaluation, getTopMoves } from '@/resources/evaluation';
import { gameOpponent, useWarmOpponent } from '@/resources/opponent';
import { hasMark, UNTOUCHED } from '@/progress/progress';
import { LESSON_INDEX } from '@/resources/lesson';
import { addMark, getProgress } from '@/resources/progress';
import { useSettings } from '@/settings/SettingsProvider';
import { useNeedsStockfish } from '@/stockfish/demand';

import { boardPress, lessonBoard } from './board';
import { ideaPlayback } from './drawings';
import {
  guidance,
  type LessonMode,
  listsTopMoves,
  notePlayback,
  type PlayedBack,
} from './guidance';
import type { Lesson, Note, PositionKey, Uci } from './lesson';
import { earnedMark, openingMarks, rowMarks, steering } from './marks';
import { lessonOpponent } from './opponent';
import { samePointer } from './peek';
import { beforeSideMoves, moveKinds, opponentPlays } from './practice';
import { initialScreen, screenReducer } from './screen';
import { bookMoves, type Candidate, engineCandidates } from './select';
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

/**
 * `lesson` played on the board, the game held in `store`. The start position
 * is where the learner picks the opening (src/lesson/openings.ts): nobody
 * replies there, so the learner plays the first move whoever's turn it is.
 * While `pending`, the game has moved on to a lesson still loading and the
 * store holds the one shown, so the learner can't move or preview a move.
 */
export function useLesson(
  lesson: Lesson,
  store: GameStore,
  { pending }: { readonly pending: boolean },
) {
  const ctrl = useController();
  const settings = useSettings();
  const { opponent } = settings;
  const focused = useIsFocused();
  // Moves are labelled by Stockfish whatever judges the bar: Maia's judgement
  // could call a book move a mistake. So Stockfish runs while this is in front.
  useNeedsStockfish(focused);
  // Ready before the guide runs out, even with auto play off for now.
  useWarmOpponent(opponent, focused);
  const [{ mode: modeState, peek, rareKey }, dispatch] = useReducer(screenReducer, initialScreen);
  const { mode } = modeState;
  const everyProgress = useSuspense(getProgress);
  const progress = everyProgress[lesson.id] ?? UNTOUCHED;
  // The opponent replies only where `opponentPlays` says; elsewhere the learner picks its move.
  // In a clean Practice run the opponent steers to lines not yet passed, so
  // runs with auto play on can pass every row, not only its most played replies.
  const rival = opponentPlays(mode, settings.auto, store[0])
    ? lessonOpponent(
        lesson,
        opponent,
        gameOpponent(ctrl, opponent),
        steering(lesson, progress, modeState),
      )
    : undefined;
  const [{ moves }] = store;
  const book = useMemo(() => bookMoves(lesson, moves), [lesson, moves]);
  const game = useGame(store, rival, {
    side: lesson.side,
    active: focused,
    judge: 'stockfish',
    book,
  });
  const { ply, plies, current } = game;
  // The store drops a move made while a lesson loads, so the board offers
  // none: chessground would show the dropped move until the lesson arrived.
  const canMove = game.canMove && !pending;
  // A move played before the learner's first starts a Practice run (`modeReducer`).
  const startsRun = beforeSideMoves(plies, lesson.side, ply);
  const kinds = moveKinds(plies, lesson.side, book);
  const view = useMemo(
    () => lessonView({ lesson, line: moves, ply, opponent }),
    [lesson, moves, ply, opponent],
  );
  // A Practice run counts the game's moves as the screen gets them, whoever
  // played them and however many landed at once.
  if (modeState.mode === 'practice' && modeState.line !== moves) {
    dispatch({ type: 'moved', from: modeState.line, line: moves, kinds });
  }
  // A row that leaves the list (played, or stepped away from) never reports
  // a hover-out or blur, so a peek ends when the board moves on; otherwise
  // stepping back would preview that row again. Shown rare rows end too, so
  // each position's list starts with them hidden.
  const { key } = view;
  const stale = (at?: PositionKey) => at !== undefined && at !== key;
  if (stale(peek?.key) || stale(rareKey)) dispatch({ type: 'board', key });
  const rareShown = rareKey === key;

  // Progress: the board's position earns its mark once it shows, and the
  // candidate rows show what is earned below them. An effect, since a
  // position shows by many events (a move, a step, the opponent's reply, a
  // mode change), and showing it is what earns the mark. The start earns
  // none: no row leads there, and its rows are other lessons' (below).
  const picking = view.ply === 0;
  const earned = picking ? undefined : earnedMark(view.place, modeState);
  useEffect(() => {
    // addMark keeps a mark already there; checking first skips the request.
    if (earned && !hasMark(progress, earned, key)) {
      // Saving can't fail beyond storage being blocked, which addMark already allows for.
      ctrl.fetch(addMark, { lesson: lesson.id, mark: earned, key }).catch(() => {});
    }
  }, [ctrl, earned, key, lesson.id, progress]);
  // The start lists every opening, each row marked from its own lesson's
  // progress and the line ends the index lists, so no lesson loads for it.
  const marks = useMemo(
    () =>
      picking ? openingMarks(LESSON_INDEX, everyProgress, view) : rowMarks(lesson, progress, view),
    [picking, everyProgress, lesson, progress, view],
  );

  // Like canMove: nothing previews while a lesson loads.
  const here = !pending && peek?.key === key ? peek : undefined;
  const playing = here?.kind === 'play' ? here : undefined;
  // A playback plays in its candidate's position, wherever the pointer goes.
  const pointer = playing ? playing.from : here?.candidate;
  // Stockfish's best move for the board's position, whatever engine judges
  // the bar, and past the guide's moves its top three; only Explore shows
  // them, so Practice asks for nothing. Not useDLE: with nullable args it
  // types schemaless data as undefined.
  const explore = focused && mode === 'explore';
  const shownLine = moves.slice(0, ply);
  const evaluationArgs = explore ? (['stockfish', shownLine] as const) : ([null] as const);
  useFetch(getEvaluation, ...evaluationArgs);
  const evaluation = useCache(getEvaluation, ...evaluationArgs);
  const topLine = focused && listsTopMoves(view, mode) ? shownLine : null;
  // A newer request drops the one the screen has left, in the engine.
  useFetch(getTopMoves, topLine);
  const topMoves = useCache(getTopMoves, topLine);
  const top = useMemo(
    () => (topMoves ? engineCandidates(lesson, key, topMoves) : []),
    [lesson, key, topMoves],
  );
  const previewOf = (at: Pointer) => preview(lesson, view, at, top);
  const shown = guidance({
    view,
    mode,
    switches: settings,
    preview: pointer && previewOf(pointer),
    dragged: pointer?.at === 'drag' ? pointer.from : undefined,
    selected: pointer?.at === 'select' ? pointer.from : undefined,
    pointed: here?.note,
    playing: playing?.played,
    engine: { best: evaluation?.best, top },
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

  // A piece dragged over a square previews its candidate there. Over a
  // square without one it is only the piece, so dragging on over such
  // squares re-renders nothing.
  const pointDrag = (drag: Drag<Square> | null) => {
    const at: Pointer | undefined = drag ? { at: 'drag', ...drag } : undefined;
    const candidate = at && !previewOf(at) ? { ...at, to: undefined } : at;
    dispatch({ type: 'candidate', key, candidate });
  };
  const playMove = (uci: string) => {
    if (canMove) game.play(uci);
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
    // As the game records it, so a king dropped on its rook is the book castle.
    onMove: (from, to) => {
      const uci = dropMove(current.fen, from, to);
      if (uci) playMove(uci);
    },
    onDrag: pointDrag,
    onPress: (square, picked) => {
      if (frame) return;
      const press = boardPress(shown, current, canMove, square, picked);
      if (press && press !== 'end') {
        play(press);
        return;
      }
      // A click that plays a move is the board's. Any other click on the side
      // to move's piece selects it, and draws its moves the way a drag does;
      // a click elsewhere, or on the selected piece again, lets the piece go,
      // as the board does.
      const piece = pieceAt(current.fen, square);
      const boardPlays = picked !== undefined && current.dests[picked]?.includes(square);
      const select =
        canMove && !boardPlays && square !== picked && piece?.color === current.turn
          ? square
          : undefined;
      dispatch({
        type: 'candidate',
        key,
        ...(select && { candidate: { at: 'select', from: select } }),
      });
    },
  };
  // The opponent's reply would move the board on and end a playback at once,
  // so none starts while one is on its way to the position shown, nor while
  // a lesson loads (like canMove).
  const playable = (note: ShownNote) =>
    game.replying || pending ? undefined : notePlayback(shown.playable, note.note)?.idea.type;
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
    chooseMode: (mode: LessonMode) => dispatch({ type: 'modeChosen', mode, line: moves, kinds }),
    /** Each candidate row's progress mark, by its move (`rowMarks`). */
    marks,
    /** The note pointed at on the idea card. */
    pointedNote: shown.pointed,
    /** The candidate list shows its rare rows (`Guidance.rare`). */
    rareShown,
    /** The learner shows or hides the candidate list's rare rows. */
    showRare: (visible: boolean) =>
      dispatch({ type: 'rare', key, shown: visible, rows: shown.rare.map(({ move }) => move.uci) }),
    /**
     * The learner points at a candidate list row. Leaving a row keeps its
     * preview, so the learner can move on to its notes; `leave` ends it.
     */
    pointRow: (uci: Uci, time?: number) => {
      // Rows report every mouse move, and a dispatch renders the screen even
      // when the reducer keeps its state, so the mouse moving on a row already
      // pointed at sends none (its preview may be hidden by a playback or a
      // loading lesson). A press or focus always goes: it may hold the row.
      const candidate: Pointer = { at: 'row', uci };
      if (time !== undefined && peek?.key === key && samePointer(peek.candidate, candidate)) return;
      dispatch({ type: 'candidate', key, candidate, time });
    },
    /** The mouse reaches the idea card at `time`: a row it only crossed on the way gives the card back. */
    reachCard: (time: number) => dispatch({ type: 'card', key, time }),
    /** The learner points at a note on the idea card, or at none. */
    pointNote: (note: Note | undefined) => dispatch({ type: 'note', key, note }),
    /** The learner lets a note on the idea card go: the mouse leaves it, or a second tap. */
    leaveNote: (note: Note) => dispatch({ type: 'leaveNote', key, note }),
    /** The learner leaves the candidates and the idea card: their previews end. */
    leave: () => dispatch({ type: 'leave' }),
  };
}
