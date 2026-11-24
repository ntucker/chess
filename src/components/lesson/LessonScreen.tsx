import { AsyncBoundary, useFetch, useSuspense } from '@data-client/react';
import { Inline, Separator, Spinner, Stack } from '@reactive/silk-native';
import { type ReactNode, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BrowserOnly } from '@/components/BrowserOnly';
import { useLabelled, useSections } from '@/components/Eyebrow';
import { StatusHeadline } from '@/components/GameStatus';
import { NewVersionPage } from '@/components/NewVersion';
import { OpponentChoice } from '@/components/OpponentChoice';
import { OpponentPicker } from '@/components/OpponentPicker';
import { Scoresheet, ScoresheetTitle } from '@/components/Scoresheet';
import { ScoresheetDrawer, ScoresheetOpener } from '@/components/ScoresheetDrawer';
import { Sheet } from '@/components/Sheet';
import { SourceFootnote } from '@/components/SourceLink';
import { resetListener } from '@/components/resetListener';
import { ReviewGameButton, ScoresheetReview } from '@/components/ReviewLinks';
import { BoardColumn, BoardColumnPlaceholder, Stage } from '@/components/Stage';
import { useBackToReview } from '@/components/useBackToReview';
import { useLongWait } from '@/components/useLongWait';
import { useNavigating } from '@/components/navigation';
import { NewVersionError } from '@/files/newVersion';
import type { VariationId } from '@/lesson/lesson';
import { getLesson, isLessonId, type LessonId } from '@/resources/lesson';
import { getProgress } from '@/resources/progress';
import { NarrowOnly, NarrowScroll, useNarrowPart } from '@/theme/Narrow';

import { AutoPlay } from './AutoPlay';
import { CandidateList, useListMinWidth } from './CandidateList';
import { IdeaAside, IdeaCard } from './IdeaCard';
import { LessonControls } from './LessonControls';
import { PointingArea } from './PointingArea';
import { SideChoice } from './SideChoice';
import { LOADING } from './status';
import { SourceCredits } from './SourceCredits';
import { TrapCard } from './TrapCard';
import { type LessonScreenInput, useLessonScreen } from './useLessonScreen';
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
  moves,
  entry,
}: {
  readonly id?: string;
  /** A variation of the lesson to open at (`useOpeningsGame`). */
  readonly variation?: string;
  /** Moves the game starts from, as the URL has them ("Play on from here", `useOpeningsGame`). */
  readonly moves?: string;
  /** The history entry the address is (`useOpeningsGame`). */
  readonly entry?: string;
}) {
  if (id !== undefined && !isLessonId(id)) {
    return <LessonPlaceholder message="There is no lesson here." />;
  }
  return (
    <BrowserOnly fallback={<LessonPlaceholder />}>
      <Openings address={id} variation={variation} moves={moves} entry={entry} />
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
  moves,
  entry,
}: {
  readonly address?: LessonId;
  readonly variation?: VariationId;
  readonly moves?: string;
  readonly entry?: string;
}) {
  const { store, lesson, side, playAs, pending } = useOpeningsGame(
    address,
    variation,
    entry,
    moves,
  );
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
function LessonScreen({ id, onPlayAs, ...input }: Omit<LessonScreenInput, 'picked'>) {
  const part = useNarrowPart();
  const labelled = useLabelled();
  const sections = useSections();
  const movesPaneStyle = useListMinWidth();
  // The progress loads beside the lesson, rather than once it has loaded.
  useFetch(getProgress);
  const picked = useSuspense(getLesson, id ?? null);
  const model = useLessonScreen({ id, picked, onPlayAs, ...input });
  // A narrow page's settings sheet, and its scoresheet drawer.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scoresheetOpen, setScoresheetOpen] = useState(false);
  const back = useBackToReview();
  // The headline tells it on a wide page, and to screen readers.
  const aside = model.aside && (
    <View aria-hidden>
      <IdeaAside {...model.aside} />
    </View>
  );
  const moveList = model.moves && <CandidateList {...model.moves} />;
  const lessonCredits = <SourceCredits sources={model.sources} />;
  /** The settings, beside the board or in a narrow page's sheet, which adds the lesson's `credits`. */
  const settings = (credits?: ReactNode) => (
    <>
      <LessonControls {...model.controls} />
      <Stack gap="1">
        <OpponentChoice />
        {credits}
      </Stack>
    </>
  );

  /** The pane beside the moves on a narrow page: the idea card, else past the guide the headline's aside, else none. */
  const ideaPane = model.idea ? (
    <NarrowScroll part="idea-pane">
      <IdeaCard {...model.idea} />
    </NarrowScroll>
  ) : aside ? (
    <NarrowScroll part="narrow-idea-pane">{aside}</NarrowScroll>
  ) : null;

  return (
    <Stage
      title={model.title}
      header={{
        ...model.header,
        back,
        // Only a narrow page shows the button, so only there does the sheet open.
        narrowButton: {
          icon: 'settings-outline',
          label: 'Settings',
          onPress: () => setSettingsOpen(true),
        },
      }}
      // A wide page credits the lesson's sources at its foot, a narrow one in its settings
      // sheet. One copy at a time, as with the settings: the sheet may stay open on a widened window.
      footer={settingsOpen ? undefined : lessonCredits}
      board={
        <BoardColumn
          {...model.board}
          rival={{
            ...model.board.rival,
            detailControl: <OpponentPicker />,
            children: <AutoPlay />,
          }}
          stepperMiddle={
            <ScoresheetOpener
              san={model.stepper.san}
              ply={model.stepper.ply}
              // Nothing to open before the first move, but an open drawer can always close: a new game empties it.
              disabled={!scoresheetOpen && !model.stepper.started}
              open={scoresheetOpen}
              onToggle={() => setScoresheetOpen(!scoresheetOpen)}
            />
          }
        />
      }
      program={
        <Stack {...part('drawer-panel', sections)}>
          <StatusHeadline
            {...model.headline}
            eyebrowInHeader
            action={model.review.offered ? <ReviewGameButton href={model.review.href} /> : null}
            news={scoresheetOpen ? model.news.scoresheet : model.news.panes}
          />
          {/* The scoresheet drawer takes the place of this part on a narrow page, under the headline, which tells of a failure. */}
          <View {...part(scoresheetOpen ? 'wide-only' : 'lesson-body', sections)}>
            {/* On a narrow page the moves follow the headline closely, with no rule between. */}
            <View {...part('wide-only')}>
              <Separator />
            </View>
            {model.trap ? <TrapCard {...model.trap} /> : null}
            {/*
             * Leaving a row for the idea card keeps its preview, so its notes can be pointed at.
             * On a narrow page the moves and the idea are panes side by side.
             */}
            {moveList || model.idea ? (
              // A View, so narrow.css can make it a row, which a Stack's inline style would override.
              <PointingArea onLeave={model.onLeave} {...part('panes', sections)}>
                {moveList ? (
                  // Beside the idea it widens for larger text; alone it fills the row.
                  <View
                    {...(ideaPane
                      ? part('moves-pane', [sections, movesPaneStyle])
                      : part('lone-pane', sections))}
                  >
                    {moveList}
                  </View>
                ) : null}
                {ideaPane}
              </PointingArea>
            ) : (
              // Before Stockfish's moves arrive, or where none are listed, it has the panel to itself.
              aside && <NarrowOnly>{aside}</NarrowOnly>
            )}
          </View>
          {scoresheetOpen ? (
            <ScoresheetDrawer
              {...model.scoresheet}
              reviewButton={
                <ScoresheetReview href={model.review.href} disabled={model.review.shut} compact />
              }
              onClose={() => setScoresheetOpen(false)}
            />
          ) : null}
          {/*
           * A narrow page has no room for the rest under the panes: the
           * scoresheet opens in the drawer, the settings in a sheet. The page's
           * copy of the settings unmounts while the sheet is open. This
           * scoresheet stays while the drawer is open, so a window widened
           * meanwhile still shows one.
           */}
          <Stack {...part('wide-only', sections)}>
            <Separator />
            <Stack style={labelled}>
              <Inline align="center" justify="between" wrap="nowrap">
                <ScoresheetTitle />
                <ScoresheetReview href={model.review.href} disabled={model.review.shut} />
              </Inline>
              <Scoresheet {...model.scoresheet} />
            </Stack>
            {settingsOpen ? null : (
              <>
                <Separator />
                {settings()}
              </>
            )}
          </Stack>
          <Sheet open={settingsOpen} title="Settings" onClose={() => setSettingsOpen(false)}>
            <Stack style={sections}>
              {/* A phone's name-bar discs are dots too small to find; this swaps sides from the sheet, in a lesson too. */}
              <SideChoice side={model.learner} onChange={onPlayAs} />
              {settings(lessonCredits)}
              <SourceFootnote />
            </Stack>
          </Sheet>
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

const styles = StyleSheet.create({ placeholder: { minHeight: 200 } });
