import { AsyncBoundary, useFetch, useSuspense } from '@data-client/react';
import { Spinner } from '@reactive/silk-native';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BrowserOnly } from '@/components/BrowserOnly';
import { StatusHeadline } from '@/components/GameStatus';
import { NewVersionPage } from '@/components/NewVersion';
import { OpponentPicker } from '@/components/OpponentPicker';
import { ScoresheetOpener } from '@/components/ScoresheetDrawer';
import { resetListener } from '@/components/resetListener';
import { BoardColumn, BoardColumnPlaceholder, Stage } from '@/components/Stage';
import { useBackToReview } from '@/components/useBackToReview';
import { useLongWait } from '@/components/useLongWait';
import { useNavigating } from '@/components/navigation';
import { NewVersionError } from '@/files/newVersion';
import type { VariationId } from '@/lesson/lesson';
import { getLesson, isLessonId, type LessonId } from '@/resources/lesson';
import { getProgress } from '@/resources/progress';
import { useLayout } from '@/theme/Narrow';

import { AutoPlay } from './AutoPlay';
import { PhoneLesson } from './layouts/PhoneLesson';
import { WideLesson } from './layouts/WideLesson';
import { LessonSettings } from './LessonSettings';
import { LOADING } from './status';
import { SourceCredits } from './SourceCredits';
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
 * one is picked, the openings of `side` alone. The one place that asks
 * which layout the panel takes (`useLayout`): the frame around it, which
 * pre-renders, takes its parts from narrow.css.
 */
function LessonScreen({ id, onPlayAs, ...input }: Omit<LessonScreenInput, 'picked'>) {
  const phone = useLayout() === 'phone';
  // The progress loads beside the lesson, rather than once it has loaded.
  useFetch(getProgress);
  const picked = useSuspense(getLesson, id ?? null);
  const model = useLessonScreen({ id, picked, onPlayAs, ...input });
  // A phone's settings sheet and scoresheet drawer, shut while the window is wide (the sheet unmounts).
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scoresheetOpen, setScoresheetOpen] = useState(false);
  const scoresheetShown = phone && scoresheetOpen;
  const back = useBackToReview();
  const openSettings = () => setSettingsOpen(true);

  return (
    <Stage
      title={model.title}
      header={{
        ...model.header,
        back,
        // Only a phone shows the button, so only there does the sheet open.
        narrowButton: {
          icon: 'settings-outline',
          label: 'Settings',
          onPress: openSettings,
          holdsTheme: true,
        },
      }}
      // A wide page credits the lesson's sources at its foot, a phone in its settings sheet.
      footer={phone ? undefined : <SourceCredits sources={model.sources} />}
      board={
        <BoardColumn
          {...model.board}
          rival={{
            ...model.board.rival,
            detailControl: <OpponentPicker />,
            children: <AutoPlay />,
          }}
          // A phone's settings open from the bar under the board too, so they come back the way the sheet went.
          onFlickUp={phone ? openSettings : undefined}
          stepperMiddle={
            <ScoresheetOpener
              san={model.stepper.san}
              ply={model.stepper.ply}
              // Nothing to open before the first move, but an open drawer can always close: a new game empties it.
              disabled={!scoresheetShown && !model.stepper.started}
              open={scoresheetShown}
              onToggle={() => setScoresheetOpen(!scoresheetShown)}
            />
          }
        />
      }
      program={
        <>
          {phone ? (
            <PhoneLesson
              model={model}
              scoresheetOpen={scoresheetShown}
              onCloseScoresheet={() => setScoresheetOpen(false)}
            />
          ) : (
            <WideLesson model={model} />
          )}
          {phone ? (
            <LessonSettings
              open={settingsOpen}
              onClose={() => setSettingsOpen(false)}
              learner={model.learner}
              onPlayAs={onPlayAs}
              sources={model.sources}
              {...model.settings}
            />
          ) : null}
        </>
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
