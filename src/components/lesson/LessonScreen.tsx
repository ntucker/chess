import { AsyncBoundary, useController, useFetch, useSuspense } from '@data-client/react';
import { Separator, Spinner, Stack } from '@reactive/silk-native';
import { useMemo, useState } from 'react';
import { useIsFocused } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { BrowserOnly } from '@/components/BrowserOnly';
import { Eyebrow, labelled } from '@/components/Eyebrow';
import { FootnoteLink } from '@/components/FootnoteLink';
import { StatusHeadline } from '@/components/GameStatus';
import { NewVersionPage } from '@/components/NewVersion';
import { OpponentChoice } from '@/components/OpponentChoice';
import { Scoresheet } from '@/components/Scoresheet';
import { Sheet } from '@/components/Sheet';
import { SourceFootnote } from '@/components/SourceLink';
import { resetListener } from '@/components/resetListener';
import { BoardColumn, BoardColumnPlaceholder, Stage } from '@/components/Stage';
import { useLongWait } from '@/components/useLongWait';
import type { MoveQuality } from '@/analysis/quality';
import { NewVersionError } from '@/files/newVersion';
import { type Color, COLORS, colorName, opposite } from '@/game/replay';
import type { GameStore } from '@/game/useGame';
import type { Lesson, Uci, VariationId } from '@/lesson/lesson';
import { lessonsAfter, lessonsFrom, openingsLesson, withOpenings } from '@/lesson/openings';
import { type Candidate, captionName, pathNames } from '@/lesson/select';
import { useLesson } from '@/lesson/useLesson';
import type { LessonView } from '@/lesson/view';
import { describeOpponent } from '@/opponent/opponent';
import { getLesson, LESSON_INDEX, LESSONS, type LessonId } from '@/resources/lesson';
import { getProgress } from '@/resources/progress';
import { useSettings } from '@/settings/SettingsProvider';
import { qualityLooks } from '@/theme/moveQuality';
import { themes } from '@/theme/theme';
import { NARROW_CSS_LOADS, narrowLength, narrowPart } from '@/theme/narrow';

import { AutoPlay } from './AutoPlay';
import { CandidateList } from './CandidateList';
import { IdeaCard } from './IdeaCard';
import { LessonControls } from './LessonControls';
import { PointingArea } from './PointingArea';
import { SourceCredits } from './SourceCredits';
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
  const loading = useLongWait(pending);
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

/** Each side's openings before one is picked. */
const OPENINGS = Object.fromEntries(
  COLORS.map((side) => [side, openingsLesson(LESSON_INDEX, side)]),
) as Record<Color, Lesson>;
const OPENINGS_TITLE = 'Openings';

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
  /** The game has moved on to a lesson that has been loading long enough to say so. */
  readonly loading: boolean;
}) {
  const ctrl = useController();
  // The progress loads beside the lesson, rather than once it has loaded.
  useFetch(getProgress);
  const picked = useSuspense(getLesson, id ?? null);
  const lesson = useMemo(
    () => (picked ? withOpenings(picked, LESSON_INDEX) : OPENINGS[side]),
    [picked, side],
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
  // The settings sheet of a narrow web page, hidden while another screen is on top.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const openSettings = () => setSettingsOpen(true);
  const closeSettings = () => setSettingsOpen(false);
  const focused = useIsFocused();
  const { auto } = useSettings();
  const learner = lesson.side;
  const rival = opposite(learner);
  const described = describeOpponent(opponent);
  const preview = guidance.preview?.candidate;
  const { trap } = guidance;
  // The card is for notes, or for the notes of a candidate pointed at.
  // Stockfish's moves have none of their own, so their list stands alone.
  const ideaCard = guidance.notes.length > 0 || guidance.candidates.length > 0;
  const names = pathNames(view.variation);
  const status = describeStatus(view, {
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

  // What the list of the rival's moves holds.
  const rivalMoves = !picking ? 'likely replies' : view.ply ? 'next move' : 'first move';
  /** Where the openings are picked, the lessons a move leads to. */
  const openings = (uci: Uci) =>
    picking ? lessonsAfter(LESSON_INDEX, learner, [...shownLine, uci]) : [];
  const line = view.variation.at(-1);
  // While picking, the header names no line, so a caption keeps its groups.
  const shortName = (id: VariationId) =>
    captionName(lesson.variations[id].name, picking ? [] : view.variation);
  const leadsTo = (candidate: Candidate) => {
    const into = openings(candidate.move.uci);
    if (into.length) return into.map((id) => LESSON_INDEX[id].title).join(' or ');
    if (candidate.variation === undefined) return 'Leaves the guide';
    return candidate.variation === line?.id ? undefined : shortName(candidate.variation);
  };
  // What the guide's candidate rows and Stockfish's top moves' rows share.
  const rowProps = {
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
    if (picking && drag) lessonsFrom(LESSON_INDEX, learner, shownLine, drag.from).forEach(load);
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
      heading="Stockfish's top moves"
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
      heading={view.learnerToMove ? 'Your candidates' : `${colorName(rival)}'s ${rivalMoves}`}
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

  /** The game's moves, where pressing one calls `onGoto`. */
  const scoresheet = (onGoto: (ply: number) => void) => (
    <Stack style={labelled}>
      <Eyebrow>Scoresheet</Eyebrow>
      <Scoresheet
        plies={game.plies}
        qualities={game.qualities}
        ply={game.ply}
        // A record of the line, so it outlives the trap's card.
        trapped={view.trap && view.trap.ply + 1}
        onGoto={onGoto}
      />
    </Stack>
  );
  const settings = (
    <>
      <LessonControls mode={mode} onMode={chooseMode} />
      <Stack gap="1">
        <OpponentChoice />
        <FootnoteLink href="/play">Or play a free game, from the first move</FootnoteLink>
        <SourceCredits sources={lesson.sources} />
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
        onSettings: openSettings,
      }}
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
          // The side is the lesson's once one is picked.
          onSwap={picking ? () => onPlayAs(rival) : undefined}
        />
      }
      program={
        <Stack {...narrowPart('lesson-panel')} style={styles.sections}>
          <StatusHeadline
            {...status}
            failure={game.error && { who: described.name, error: game.error, onRetry: game.retry }}
            eyebrowInHeader
            eyebrowLink={listLink}
          />
          {/* On a narrow web page the moves follow the headline closely, with no rule between. */}
          <View {...narrowPart('wide-only')}>
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
           * On a narrow web page the moves and the idea are panes side by side.
           */}
          {moveList || ideaCard ? (
            <PointingArea onLeave={leave} style={styles.sections}>
              {moveList ? (
                <View {...narrowPart('moves-pane')} style={styles.sections}>
                  {moveList}
                </View>
              ) : null}
              {ideaCard ? (
                <View {...narrowPart('idea-pane')}>
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
                </View>
              ) : null}
            </PointingArea>
          ) : null}
          {/* A narrow web page has no room for the rest under the panes: it opens in a sheet. */}
          <Stack {...narrowPart('wide-only')} style={styles.sections}>
            <Separator />
            {scoresheet(game.goto)}
            <Separator />
            {settings}
          </Stack>
          {NARROW_CSS_LOADS ? (
            <Sheet title="Settings" visible={settingsOpen && focused} onClose={closeSettings}>
              <Stack style={styles.sections}>
                {settings}
                <SourceFootnote />
                <Separator />
                {scoresheet((ply) => {
                  // Shows the move picked on the board, which the sheet covers.
                  closeSettings();
                  game.goto(ply);
                })}
              </Stack>
            </Sheet>
          ) : null}
        </Stack>
      }
    />
  );
}

interface StatusInput {
  /** Whether the board shows where the openings are picked (`isPicking`). */
  readonly picking: boolean;
  /** The game has moved on to a lesson that has been loading long enough to say so. */
  readonly loading: boolean;
  /** The lesson's title, for a position before any variation. */
  readonly title: string;
  /** The names along the board's variation (`pathNames`). */
  readonly names: readonly string[];
  /** The opponent's side, as shown: "White". */
  readonly rival: string;
  /** Who plays past the guide: "Maia". */
  readonly engine: string;
  /** The opponent is replying to the position shown (`Game.replying`). */
  readonly replying: boolean;
  /** The board shows an earlier move than the latest. */
  readonly viewing: boolean;
  /** Auto play: the opponent plays on by itself past the guide. */
  readonly auto: boolean;
  /** The learner may play the side to move's move now: on the opponent's turn, they pick it. */
  readonly canPlay: boolean;
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
 * `routine` marks a headline that only says whose move it is and how to use
 * the screen, once the learner has moved and so has seen how.
 */
function describeStatus(
  view: LessonView,
  {
    picking,
    loading,
    title,
    names,
    rival,
    engine,
    replying,
    viewing,
    auto,
    canPlay,
    lineEnded,
    startsRun,
    practice,
  }: StatusInput,
) {
  if (loading) return { eyebrow: picking ? OPENINGS_TITLE : title, ...LOADING };
  if (picking)
    return {
      eyebrow: OPENINGS_TITLE,
      title: 'Pick an opening.',
      detail:
        'Each move here leads to the lesson named beside it. Play one on the board or in the list.',
    };
  const eyebrow = names.join(' · ') || title;
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
      routine: !startsRun && !practice && !viewing,
      detail:
        practice && startsRun && viewing
          ? YOUR_MOVE.practice.restart
          : YOUR_MOVE[practice ? 'practice' : 'explore'][viewing ? 'viewing' : 'latest'],
    };
  const reply = canPlay
    ? `Choose ${rival}'s reply.`
    : replying
      ? `${rival} is choosing…`
      : `${rival}'s move.`;
  if (practice && view.ply > 0)
    return {
      eyebrow,
      title: practice.verdict ? `${qualityLooks[practice.verdict].name}.` : 'Checking your move…',
      detail: reply,
    };
  return {
    eyebrow,
    title: reply,
    routine: !startsRun,
    detail: canPlay
      ? 'Point at a reply to see what it aims for, then play it.'
      : 'Point at a reply to see what it aims for.',
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
  if (error instanceof NewVersionError) {
    return <NewVersionPage detail="Reload to open the lesson. Your progress in it stays." />;
  }
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

/** Space between the panel's sections: Silk's step 5, less on a narrow web page. */
const SECTION_GAP = narrowLength('section-gap', themes.dark.semantic.space[5]);

const styles = StyleSheet.create({
  sections: { gap: SECTION_GAP.value },
  placeholder: { minHeight: 200 },
});
