import { AsyncBoundary, useController, useFetch, useSuspense } from '@data-client/react';
import { Separator, Spinner, Stack } from '@reactive/silk-native';
import { type ReactNode, use, useMemo, useState } from 'react';
import { View } from 'react-native';

import { BrowserOnly } from '@/components/BrowserOnly';
import { Eyebrow, useLabelled } from '@/components/Eyebrow';
import { StatusHeadline } from '@/components/GameStatus';
import { NewVersionPage } from '@/components/NewVersion';
import { OpponentChoice } from '@/components/OpponentChoice';
import { OpponentPicker } from '@/components/OpponentPicker';
import { Scoresheet } from '@/components/Scoresheet';
import { Sheet } from '@/components/Sheet';
import { SourceFootnote } from '@/components/SourceLink';
import { resetListener } from '@/components/resetListener';
import { BoardColumn, BoardColumnPlaceholder, Stage } from '@/components/Stage';
import { useLongWait } from '@/components/useLongWait';
import { useNavigating } from '@/components/navigation';
import { NewVersionError } from '@/files/newVersion';
import { type Color, colorName, opposite } from '@/game/replay';
import type { GameStore } from '@/game/useGame';
import { listsTopMoves } from '@/lesson/guidance';
import type { Uci, VariationId } from '@/lesson/lesson';
import { lessonsAfter, lessonsFrom, openingsLesson, withOpenings } from '@/lesson/openings';
import { type Candidate, captionName, pathNames } from '@/lesson/select';
import { useLesson } from '@/lesson/useLesson';
import { describeOpponent } from '@/opponent/opponent';
import { getLesson, LessonIndexContext, LESSONS, type LessonId } from '@/resources/lesson';
import { getProgress } from '@/resources/progress';
import { useSettings } from '@/settings/SettingsProvider';
import { themes } from '@/theme/theme';
import { narrowLength, narrowStyles } from '@/theme/narrow';
import { NarrowOnly, NarrowScroll, useNarrowPart, useNarrowStyles } from '@/theme/Narrow';

import { AutoPlay } from './AutoPlay';
import { CandidateList } from './CandidateList';
import { IdeaAside, IdeaCard } from './IdeaCard';
import { LessonControls } from './LessonControls';
import { PointingArea } from './PointingArea';
import { SideChoice } from './SideChoice';
import { describeStatus, headlineNews, LOADING, OPENINGS_TITLE } from './status';
import { SourceCredits } from './SourceCredits';
import { ScoresheetDrawer, ScoresheetOpener } from './ScoresheetDrawer';
import { TrapCard } from './TrapCard';
import { useOpeningsGame } from './useOpeningsGame';

/**
 * The openings as a page: the start position, where the learner picks a
 * side and an opening by its moves (src/lesson/openings.ts), then that
 * opening's lesson. `id` is the lesson the address names (`/lesson/<id>`), none at the
 * start. The exported HTML holds only its frame: lessons load in the
 * browser, since reading one during the export hangs it.
 */
export function LessonPage({
  id,
  variation,
  entry,
}: {
  readonly id?: string;
  /** A variation of the lesson to open at (`useOpeningsGame`). */
  readonly variation?: string;
  /** The history entry the address is (`useOpeningsGame`). */
  readonly entry?: string;
}) {
  if (id !== undefined && !Object.hasOwn(LESSONS, id)) {
    return <LessonPlaceholder message="There is no lesson here." />;
  }
  return (
    <BrowserOnly fallback={<LessonPlaceholder />}>
      <Openings address={id as LessonId | undefined} variation={variation} entry={entry} />
    </BrowserOnly>
  );
}

/**
 * One game across every opening: its first moves pick the lesson, which
 * loads once picked. The game is held here, above the boundary, so its moves
 * stay while the lesson loads, and stepping back to the start to pick
 * another opening carries on the same game. The screen stays too, so the
 * mode chosen carries over; a Practice run restarts at the learner's first
 * move anyway, and what the learner points at belongs to a position.
 *
 * The address follows the lesson picked (`useOpeningsGame`), so a reload
 * reopens it and the browser's Back returns to the start.
 */
function Openings({
  address,
  variation,
  entry,
}: {
  readonly address?: LessonId;
  readonly variation?: VariationId;
  readonly entry?: string;
}) {
  const { store, lesson, side, playAs, pending } = useOpeningsGame(address, variation, entry);
  // A navigation in a transition (the browser's Back or Forward) keeps the page
  // up while the next one loads its lesson: a long one says so too. It changes
  // nothing else, so the board, maybe hidden by then, doesn't redraw.
  const navigating = useNavigating();
  const loading = useLongWait(pending || navigating);
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
      <LessonScreen
        id={lesson}
        side={side}
        onPlayAs={playAs}
        store={store}
        pending={pending}
        loading={loading}
      />
    </AsyncBoundary>
  );
}

/**
 * The lesson `id` played on the board, in Explore or Practice, or before
 * one is picked, the openings of `side` alone.
 */
function LessonScreen({
  id,
  side,
  onPlayAs,
  store,
  pending,
  loading,
}: {
  readonly id?: LessonId;
  /** The side the learner plays, the lesson's once one is picked. */
  readonly side: Color;
  /** The learner chooses to play as the other side, from its start. */
  readonly onPlayAs: (side: Color) => void;
  readonly store: GameStore;
  /** The game has moved on to a lesson still loading: the learner can't move. */
  readonly pending: boolean;
  /** A lesson, or the next page, has been loading long enough to say so. */
  readonly loading: boolean;
}) {
  const ctrl = useController();
  const styles = useNarrowStyles(STYLES);
  const part = useNarrowPart();
  const labelled = useLabelled();
  // The progress loads beside the lesson, rather than once it has loaded.
  useFetch(getProgress);
  const picked = useSuspense(getLesson, id ?? null);
  const index = use(LessonIndexContext);
  // Before one is picked, the openings of `side` alone.
  const lesson = useMemo(
    () => (picked ? withOpenings(picked, index) : openingsLesson(index, side)),
    [picked, index, side],
  );
  const {
    game,
    opponent,
    picking,
    shownLine,
    view,
    guidance,
    board,
    playback,
    canPlay,
    play,
    pointedNote,
    marks,
    rareShown,
    showRare,
    pointRow,
    reachCard,
    pointNote,
    leaveNote,
    leave,
    modeState,
    startsRun,
    chooseMode,
  } = useLesson(lesson, store, { pending });
  const { mode } = modeState;
  // A narrow page's settings sheet, and its scoresheet drawer.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scoresheetOpen, setScoresheetOpen] = useState(false);
  const { auto } = useSettings();
  const learner = lesson.side;
  const rival = opposite(learner);
  const described = describeOpponent(opponent);
  const preview = guidance.preview?.candidate;
  const { trap } = guidance;
  // The card is for notes, or for the notes of a candidate pointed at.
  // Stockfish's moves have none of their own.
  const ideaCard = guidance.notes.length > 0 || guidance.candidates.length > 0;
  const names = pathNames(view.variation);
  const { pastGuide, ...status } = describeStatus(view, {
    picking,
    loading,
    title: lesson.title,
    names,
    rival: colorName(rival),
    engine: described.name,
    replying: game.replying,
    viewing: !game.atLatest,
    auto,
    canPlay,
    lineEnded: guidance.lineEnded,
    startsRun,
    practice:
      modeState.mode === 'practice' ? { clean: modeState.clean, verdict: game.quality } : undefined,
  });
  // Where Stockfish's moves stand in for the guide's, a narrow page tells why
  // in the idea pane's place, beside them as the idea is beside the guide's
  // moves, rather than under the headline. A failure keeps the headline's.
  const aside =
    pastGuide && listsTopMoves(view, mode) && !ideaCard && !game.error ? (
      // The headline tells it on a wide page, and to screen readers.
      <View aria-hidden>
        <IdeaAside title={pastGuide} detail={status.detail} />
      </View>
    ) : null;

  // What the list of the rival's moves holds.
  const rivalMoves = !picking ? 'likely replies' : view.ply ? 'next move' : 'first move';
  /** Where the openings are picked, the lessons a move leads to. */
  const openings = (uci: Uci) => (picking ? lessonsAfter(index, learner, [...shownLine, uci]) : []);
  const line = view.variation.at(-1);
  // While picking, the header names no line, so a caption keeps its groups.
  const shortName = (id: VariationId) =>
    captionName(lesson.variations[id].name, picking ? [] : view.variation);
  const leadsTo = (candidate: Candidate) => {
    const into = openings(candidate.move.uci);
    if (into.length) return into.map((id) => index[id].title).join(' or ');
    if (candidate.variation === undefined) return 'Leaves the guide';
    return candidate.variation === line?.id ? undefined : shortName(candidate.variation);
  };
  // What the guide's candidate rows and Stockfish's top moves' rows share.
  const rowProps = {
    position: view.key,
    pointed: preview?.move.uci,
    marks,
    playable: canPlay,
    onPlay: play,
    onTabOut: leave,
  };
  // Past the guide, a move of Stockfish's can lead back into it.
  const rejoins = ({ variation }: Candidate) =>
    variation === undefined ? undefined : `Rejoins ${shortName(variation)}`;
  // Pointing at an opening, or picking up a piece that plays one, starts
  // loading its lesson, so playing it needn't wait. A failure shows once the
  // opening is picked.
  const load = (id: LessonId) => {
    ctrl.fetchIfStale(getLesson, id);
  };
  const pointCandidate = (uci: Uci, time?: number) => {
    openings(uci).forEach(load);
    pointRow(uci, time);
  };
  const onDrag: typeof board.onDrag = (drag) => {
    // Each report repeats the request, which fetchIfStale makes free.
    if (picking && drag) lessonsFrom(index, learner, shownLine, drag.from).forEach(load);
    board.onDrag?.(drag);
  };

  // The opening's name opens the list of every opening, which marks where the board is.
  // From the line's id, which the React Compiler sees unchanged from move to move.
  const lineId = line?.id;
  const listLink = {
    href: {
      pathname: '/openings',
      params: id === undefined ? {} : { lesson: id, ...(lineId && { variation: lineId }) },
    },
    label: 'Every opening',
  } as const;

  // The moves the learner can point at: past the guide Stockfish's, else the guide's.
  const moveList = guidance.top.length ? (
    <CandidateList
      {...rowProps}
      heading="top moves"
      owner="Stockfish"
      compact
      leadsTo={rejoins}
      candidates={guidance.top}
      rare={[]}
      rareShown={false}
      onShowRare={showRare}
      main={guidance.top[0]}
      onPoint={pointRow}
    />
  ) : guidance.candidates.length ? (
    <CandidateList
      {...rowProps}
      heading={view.learnerToMove ? 'Your candidates' : rivalMoves}
      owner={view.learnerToMove ? undefined : colorName(rival)}
      // At the start each move's opening is the point, so its rows keep it.
      compact={!picking}
      leadsTo={leadsTo}
      candidates={guidance.candidates}
      rare={guidance.rare}
      rareShown={rareShown}
      onShowRare={showRare}
      main={guidance.main}
      onPoint={pointCandidate}
    />
  ) : null;

  /** The game's moves, for the scoresheet beside the panes or in their place. */
  const scoresheetProps = {
    plies: game.plies,
    qualities: game.qualities,
    ply: game.ply,
    // A record of the line, so it outlives the trap's card.
    trapped: view.trap && view.trap.ply + 1,
    onGoto: game.goto,
  };
  const lessonCredits = <SourceCredits sources={lesson.sources} />;
  /** The settings, beside the board or in a narrow page's sheet, which adds the lesson's `credits`. */
  const settings = (credits?: ReactNode) => (
    <>
      <LessonControls mode={mode} onMode={chooseMode} />
      <Stack gap="1">
        <OpponentChoice />
        {credits}
      </Stack>
    </>
  );

  return (
    <Stage
      title={`${lesson.title} · Opening Night`}
      header={{
        // Only the latest line's name and its parent's, since the path won't fit a narrow page.
        place: picking
          ? { name: OPENINGS_TITLE }
          : { name: names.at(-1) ?? lesson.title, parent: names.at(-2) },
        placeLink: listLink,
        // Only a narrow page shows the button, so only there does the sheet open.
        onSettings: () => setSettingsOpen(true),
      }}
      // A wide page credits the lesson's sources at its foot, a narrow one in its settings
      // sheet. One copy at a time, as with the settings: the sheet may stay open on a widened window.
      footer={settingsOpen ? undefined : lessonCredits}
      board={
        <BoardColumn
          game={game}
          rival={{
            name: colorName(rival),
            detail: `The guide's moves, then ${described.lead.toLowerCase()}`,
            brief: described.lead,
            detailControl: <OpponentPicker />,
            children: <AutoPlay />,
          }}
          board={{ ...board, onDrag }}
          // The side is the lesson's once one is picked.
          onSwap={picking ? () => onPlayAs(rival) : undefined}
          stepperMiddle={
            <ScoresheetOpener
              san={game.plies[game.ply].move?.san}
              ply={game.ply}
              // Nothing to open before the first move, but an open drawer can always close: a new game empties it.
              disabled={!scoresheetOpen && game.moves.length === 0}
              open={scoresheetOpen}
              onToggle={() => setScoresheetOpen(!scoresheetOpen)}
            />
          }
        />
      }
      program={
        <Stack {...part('lesson-panel', styles.sections)}>
          <StatusHeadline
            {...status}
            failure={game.error && { who: described.name, error: game.error, onRetry: game.retry }}
            eyebrowInHeader
            eyebrowLink={listLink}
            news={headlineNews(
              { news: status.news, pastGuide },
              { aside: !!aside, scoresheetOpen, failed: !!game.error },
            )}
          />
          {/* The scoresheet drawer takes the place of this part on a narrow page, under the headline, which tells of a failure. */}
          <View {...part(scoresheetOpen ? 'wide-only' : 'lesson-body', styles.sections)}>
            {/* On a narrow page the moves follow the headline closely, with no rule between. */}
            <View {...part('wide-only')}>
              <Separator />
            </View>
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
            {/*
             * Leaving a row for the idea card keeps its preview, so its notes can be pointed at.
             * On a narrow page the moves and the idea are panes side by side.
             */}
            {moveList || ideaCard ? (
              // A View, so narrow.css can make it a row, which a Stack's inline style would override.
              <PointingArea onLeave={leave} {...part('panes', styles.sections)}>
                {moveList ? <View {...part('moves-pane', styles.sections)}>{moveList}</View> : null}
                {ideaCard ? (
                  <NarrowScroll part="idea-pane">
                    <IdeaCard
                      title={preview ? `If ${preview.san}` : 'The idea'}
                      notes={guidance.notes}
                      learner={learner}
                      playback={playback}
                      pointable={guidance.pointable}
                      pointed={pointedNote}
                      onPoint={pointNote}
                      onLeave={leaveNote}
                      onReach={reachCard}
                    />
                  </NarrowScroll>
                ) : aside ? (
                  <NarrowScroll part="narrow-idea-pane">{aside}</NarrowScroll>
                ) : null}
              </PointingArea>
            ) : (
              // Before Stockfish's moves arrive, or where none are listed, it has the panel to itself.
              aside && <NarrowOnly>{aside}</NarrowOnly>
            )}
          </View>
          {scoresheetOpen ? (
            <ScoresheetDrawer {...scoresheetProps} onClose={() => setScoresheetOpen(false)} />
          ) : null}
          {/*
           * A narrow page has no room for the rest under the panes: the
           * scoresheet opens in the drawer, the settings in a sheet. Only one
           * copy of the settings is mounted at a time. This scoresheet stays
           * while the drawer is open, so a window widened meanwhile still shows one.
           */}
          <Stack {...part('wide-only', styles.sections)}>
            <Separator />
            <Stack style={labelled}>
              <Eyebrow>Scoresheet</Eyebrow>
              <Scoresheet {...scoresheetProps} />
            </Stack>
            {settingsOpen ? null : (
              <>
                <Separator />
                {settings()}
              </>
            )}
          </Stack>
          {settingsOpen ? (
            <Sheet title="Settings" onClose={() => setSettingsOpen(false)}>
              <Stack style={styles.sections}>
                {/* A phone's name-bar discs are dots too small to find; this swaps sides from the sheet, in a lesson too. */}
                <SideChoice side={learner} onChange={onPlayAs} />
                {settings(lessonCredits)}
                <SourceFootnote />
              </Stack>
            </Sheet>
          ) : null}
        </Stack>
      }
    />
  );
}

/** The lesson page when its lesson failed to load. */
function LessonFailure({ error }: { readonly error: Error }) {
  if (error instanceof NewVersionError) {
    return <NewVersionPage detail="Reload to open the lesson. Your progress in it stays." />;
  }
  return <LessonPlaceholder message={error.message} />;
}

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
  const styles = useNarrowStyles(STYLES);
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
            news="all"
          />
        </View>
      }
    />
  );
}

/** Space between the panel's sections: Silk's step 5, less on a narrow page. */
const SECTION_GAP = narrowLength('section-gap', themes.dark.semantic.space[5]);

const STYLES = narrowStyles((px) => ({
  sections: { gap: px(SECTION_GAP) },
  placeholder: { minHeight: 200 },
}));
