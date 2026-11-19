import { AsyncBoundary, useController, useSuspense } from '@data-client/react';
import { Separator, Spinner, Stack } from '@reactive/silk-native';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { BrowserOnly } from '@/components/BrowserOnly';
import { Eyebrow } from '@/components/Eyebrow';
import { FootnoteLink } from '@/components/FootnoteLink';
import { StatusHeadline } from '@/components/GameStatus';
import { OpponentChoice } from '@/components/OpponentChoice';
import { Scoresheet } from '@/components/Scoresheet';
import { resetListener } from '@/components/resetListener';
import { BoardColumn, BoardColumnPlaceholder, Stage } from '@/components/Stage';
import { useLongWait } from '@/components/useLongWait';
import type { MoveQuality } from '@/analysis/quality';
import { colorName, opposite } from '@/game/replay';
import type { GameStore } from '@/game/useGame';
import type { Uci } from '@/lesson/lesson';
import { lessonOf, lessonsFrom, openingsLesson, withOpenings } from '@/lesson/openings';
import type { Candidate } from '@/lesson/select';
import { useLesson } from '@/lesson/useLesson';
import type { LessonView } from '@/lesson/view';
import { describeOpponent } from '@/opponent/opponent';
import { getLesson, LESSON_INDEX, LESSONS, type LessonId } from '@/resources/lesson';
import { useSettings } from '@/settings/SettingsProvider';
import { qualityLooks } from '@/theme/moveQuality';

import { AutoPlay } from './AutoPlay';
import { CandidateList } from './CandidateList';
import { IdeaCard } from './IdeaCard';
import { LessonControls } from './LessonControls';
import { PointingArea } from './PointingArea';
import { TrapCard } from './TrapCard';
import { useOpeningsGame } from './useOpeningsGame';

/**
 * The openings as a page: the start position, where the learner picks an
 * opening by its first move (src/lesson/openings.ts), then that opening's
 * lesson. `id` is the lesson the address names (`/lesson/<id>`), none at the
 * start. The exported HTML holds only its frame: lessons load in the
 * browser, since reading one during the export hangs it.
 */
export function LessonPage({ id }: { readonly id?: string }) {
  if (id !== undefined && !Object.hasOwn(LESSONS, id)) {
    return <LessonPlaceholder message="There is no lesson here." />;
  }
  return (
    <BrowserOnly fallback={<LessonPlaceholder />}>
      <Openings address={id as LessonId | undefined} />
    </BrowserOnly>
  );
}

/**
 * One game across every opening: its first move picks the lesson, which
 * loads once picked. The game is held here, above the boundary, so its moves
 * stay while the lesson loads, and stepping back to the start to pick
 * another opening carries on the same game. The screen stays too, so the
 * mode chosen carries over; a Practice run restarts at the learner's first
 * move anyway, and what the learner points at belongs to a position.
 *
 * The address follows the lesson picked (`useOpeningsGame`), so a reload
 * reopens it and the browser's Back returns to the start.
 */
function Openings({ address }: { readonly address?: LessonId }) {
  const { store, pending } = useOpeningsGame(address);
  const loading = useLongWait(pending);
  const lesson = lessonOf(LESSON_INDEX, store[0].moves);
  // A failed lesson clears once the page shows another (Back to the start).
  // A `key` would remount the page and lose the game, so the boundary resets.
  const resetOnLesson = useMemo(() => resetListener(lesson), [lesson]);
  return (
    <AsyncBoundary
      // Untitled: React renders this fallback, uncommitted, whenever a lesson
      // loads in the background, and the tab's title would take it.
      fallback={<LessonPlaceholder untitled />}
      errorComponent={LessonFailure}
      listen={resetOnLesson}
    >
      <LessonScreen id={lesson} store={store} loading={loading} />
    </AsyncBoundary>
  );
}

/** The start position before an opening is picked. */
const OPENINGS = openingsLesson(LESSON_INDEX);

/**
 * The lesson `id` played on the board, in Explore or Practice, or before
 * one is picked, the start position's openings alone.
 */
function LessonScreen({
  id,
  store,
  loading,
}: {
  readonly id?: LessonId;
  readonly store: GameStore;
  /** The game has moved on to a lesson that has been loading long enough to say so. */
  readonly loading: boolean;
}) {
  const ctrl = useController();
  const picked = useSuspense(getLesson, id ?? null);
  const lesson = useMemo(() => (picked ? withOpenings(picked, LESSON_INDEX) : OPENINGS), [picked]);
  const {
    game,
    opponent,
    view,
    guidance,
    board,
    playback,
    canPlay,
    play,
    pointedNote,
    rareShown,
    showRare,
    pointRow,
    pointNote,
    leaveNote,
    leave,
    modeState,
    startsRun,
    chooseMode,
  } = useLesson(lesson, store);
  const { mode } = modeState;
  const { auto } = useSettings();
  const learner = lesson.side;
  const rival = opposite(learner);
  const described = describeOpponent(opponent);
  const preview = guidance.preview?.candidate;
  const { trap } = guidance;
  // The card is for notes, or for the notes of a candidate pointed at.
  const ideaCard = guidance.notes.length > 0 || guidance.candidates.length > 0;
  // The start lists the openings, whichever lesson is loaded.
  const picking = view.ply === 0;
  const status = describeStatus(view, {
    picking,
    loading,
    title: lesson.title,
    rival: colorName(rival),
    engine: described.name,
    thinking: game.thinking,
    viewing: !game.atLatest,
    auto,
    lineEnded: guidance.lineEnded,
    startsRun,
    practice:
      modeState.mode === 'practice' ? { clean: modeState.clean, verdict: game.quality } : undefined,
  });

  const opening = (uci: Uci) => (picking ? lessonOf(LESSON_INDEX, [uci]) : undefined);
  const line = view.variation.at(-1);
  const leadsTo = (candidate: Candidate) => {
    const into = opening(candidate.move.uci);
    if (into) return LESSON_INDEX[into].title;
    if (candidate.variation === undefined) return 'Leaves the guide';
    const variation = lesson.variations[candidate.variation];
    return variation === line ? undefined : variation.name;
  };
  // Pointing at an opening, or picking up a piece that plays one, starts
  // loading its lesson, so playing it needn't wait. A failure shows once the
  // opening is picked.
  const load = (id: LessonId) => ctrl.fetchIfStale(getLesson, id).catch(() => {});
  const pointCandidate = (uci: Uci) => {
    const into = opening(uci);
    if (into) load(into);
    pointRow(uci);
  };
  const onDrag: typeof board.onDrag = (drag) => {
    // Each report repeats the request, which fetchIfStale makes free.
    if (picking && drag) lessonsFrom(LESSON_INDEX, drag.from).forEach(load);
    board.onDrag?.(drag);
  };

  return (
    <Stage
      title={`${lesson.title} · Opening Night`}
      // Only the latest line's name, since the path won't fit a phone. A
      // sub-line's name starts with its parent's ("Advance Variation: Tal…");
      // the opening's own name is what goes unsaid.
      place={picking ? OPENINGS.title : (line?.name ?? lesson.title)}
      board={
        <BoardColumn
          game={game}
          rival={{
            name: colorName(rival),
            detail: `The guide's moves, then ${described.tagline.toLowerCase()}`,
            brief: described.tagline,
            children: <AutoPlay />,
          }}
          board={{ ...board, onDrag }}
        />
      }
      program={
        <Stack gap="5">
          <StatusHeadline
            {...status}
            failure={game.error && { who: described.name, onRetry: game.retry }}
            eyebrowInHeader
          />
          <Separator />
          {/* Leaving a row for the idea card keeps its preview, so its notes can be pointed at. */}
          {trap ? (
            <TrapCard
              trap={trap}
              mistake={game.plies[trap.ply + 1].move!.san}
              fell={game.plies[trap.ply].turn}
              learner={learner}
              playback={playback}
              onBack={() => game.goto(trap.ply)}
            />
          ) : null}
          {ideaCard ? (
            <PointingArea onLeave={leave}>
              {guidance.candidates.length ? (
                <Stack gap="3">
                  <Eyebrow>
                    {view.learnerToMove
                      ? 'Your candidates'
                      : `${colorName(rival)}'s ${picking ? 'first move' : 'likely replies'}`}
                  </Eyebrow>
                  <CandidateList
                    candidates={guidance.candidates}
                    rare={guidance.rare}
                    rareShown={rareShown}
                    onShowRare={showRare}
                    main={guidance.main}
                    pointed={preview?.move.uci}
                    leadsTo={leadsTo}
                    playable={canPlay}
                    onPlay={play}
                    onPoint={pointCandidate}
                    onTabOut={leave}
                  />
                </Stack>
              ) : null}
              <IdeaCard
                title={preview ? `If ${preview.san}` : 'The idea'}
                notes={guidance.notes}
                learner={learner}
                playback={playback}
                pointable={guidance.pointable}
                pointed={pointedNote}
                onPoint={pointNote}
                onLeave={leaveNote}
              />
            </PointingArea>
          ) : null}
          <Separator />
          <Stack gap="3">
            <Eyebrow>Scoresheet</Eyebrow>
            <Scoresheet
              plies={game.plies}
              qualities={game.qualities}
              ply={game.ply}
              // A record of the line, so it outlives the trap's card.
              trapped={view.trap && view.trap.ply + 1}
              onGoto={game.goto}
            />
          </Stack>
          <Separator />
          <LessonControls mode={mode} onMode={chooseMode} />
          <Stack gap="1">
            <OpponentChoice />
            <FootnoteLink href="/play">Or play a free game, from the first move</FootnoteLink>
          </Stack>
        </Stack>
      }
    />
  );
}

interface StatusInput {
  /** Whether the board shows the start, where the first move picks the opening. */
  readonly picking: boolean;
  /** The game has moved on to a lesson that has been loading long enough to say so. */
  readonly loading: boolean;
  /** The lesson's title, for a position before any variation. */
  readonly title: string;
  /** The opponent's side, as shown: "White". */
  readonly rival: string;
  /** Who plays past the guide: "Maia". */
  readonly engine: string;
  readonly thinking: boolean;
  /** The board shows an earlier move than the latest. */
  readonly viewing: boolean;
  /** The opponent replies by itself; off, the learner picks its move. */
  readonly auto: boolean;
  /** The headline tells of a guide line's end (`Guidance.lineEnded`). */
  readonly lineEnded: boolean;
  /**
   * No move of the learner's comes before the board's position: the learner
   * has yet to move, and a move there starts a Practice run, so it's no
   * take-back (`beforeSideMoves`).
   */
  readonly startsRun: boolean;
  /** In Practice: whether the run is clean, and the label of the move the board shows. */
  readonly practice?: { readonly clean: boolean; readonly verdict?: MoveQuality };
}

/**
 * The panel's headline: where the lesson stands and whose move it is. In
 * Practice, right after the learner's move, it judges that move first.
 * `seenHint` marks a detail that only tells how to use the screen, once the
 * learner has moved and so has seen it.
 */
function describeStatus(
  view: LessonView,
  {
    picking,
    loading,
    title,
    rival,
    engine,
    thinking,
    viewing,
    auto,
    lineEnded,
    startsRun,
    practice,
  }: StatusInput,
) {
  if (loading) return { eyebrow: picking ? OPENINGS.title : title, ...LOADING };
  if (picking)
    return {
      eyebrow: OPENINGS.title,
      title: 'Pick an opening.',
      detail: `Each of ${rival}'s first moves leads to the defence you learn against it. Play one on the board or in the list.`,
    };
  const eyebrow = view.variation.map(({ name }) => name).join(' · ') || title;
  // Beyond the guide with auto play off, nobody replies: the learner moves both sides.
  const playOn = auto ? `play on against ${engine}` : 'play on, moving both sides';
  if (lineEnded && practice?.clean)
    return {
      eyebrow,
      title: 'Line complete.',
      detail: 'A clean run: each of your moves from the book, and nothing taken back.',
    };
  if (lineEnded)
    return {
      eyebrow,
      title: 'End of this line.',
      detail: practice
        ? 'This run wasn’t clean: a slip, a take-back, or Practice chosen after your first move. Go back to your first move and play it through.'
        : `The guide stops here. Step back to try another branch, or ${playOn}.`,
    };
  // An `end` place is always a line end the headline tells (see above).
  if (view.place === 'beyond')
    return {
      eyebrow,
      title: 'Off the guide.',
      detail: `This position isn't in the lesson. Step back to return to the guide, or ${playOn}.`,
    };
  if (view.learnerToMove)
    return {
      eyebrow,
      title: 'Your move.',
      // Only Explore's detail at the latest move is how-to; the others say what a move here does.
      seenHint: !startsRun && !practice && !viewing,
      detail:
        practice && startsRun && viewing
          ? YOUR_MOVE.practice.restart
          : YOUR_MOVE[practice ? 'practice' : 'explore'][viewing ? 'viewing' : 'latest'],
    };
  let reply = `Choose ${rival}'s reply.`;
  if (auto) reply = `${rival}'s move.`;
  if (thinking) reply = `${rival} is choosing…`;
  if (practice && view.ply > 0)
    return {
      eyebrow,
      title: practice.verdict ? `${qualityLooks[practice.verdict].name}.` : 'Checking your move…',
      detail: reply,
    };
  return {
    eyebrow,
    title: reply,
    seenHint: !startsRun,
    detail: auto
      ? 'Point at a reply to see what it aims for.'
      : 'Point at a reply to see what it aims for, then play it.',
  };
}

/**
 * The detail under "Your move.", by mode and whether an earlier move is
 * shown; `restart` is Practice's when a move there starts a run.
 */
const YOUR_MOVE = {
  explore: {
    latest: 'Point at a candidate or a note to see it on the board, then play any move you like.',
    viewing: 'Play a move here to try another branch.',
  },
  practice: {
    latest: 'No hints in Practice. Play the move you would choose.',
    viewing: 'Playing here takes a move back, which ends a clean run.',
    restart: 'Playing here starts a new run from your first move.',
  },
} as const;

/** The lesson page when its lesson failed to load. */
function LessonFailure({ error }: { readonly error: Error }) {
  return <LessonPlaceholder message={error.message} />;
}

/** The headline while a lesson loads. */
const LOADING = { title: 'Setting the stage…', detail: 'Loading the lesson.' } as const;

/**
 * The lesson page before the lesson arrives, or with `message` when it can't
 * be shown; `untitled` leaves the tab's title as it is.
 */
function LessonPlaceholder({
  message,
  untitled,
}: {
  readonly message?: string;
  readonly untitled?: boolean;
}) {
  return (
    <Stage
      title={untitled ? undefined : 'Lesson · Opening Night'}
      board={
        <BoardColumnPlaceholder>
          {message ? null : <Spinner label="Loading the lesson" />}
        </BoardColumnPlaceholder>
      }
      program={
        <View style={styles.placeholder}>
          <StatusHeadline
            eyebrow="Lesson"
            title={message ? 'Curtain stays down.' : LOADING.title}
            detail={message ?? LOADING.detail}
          />
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  placeholder: { minHeight: 200 },
});
