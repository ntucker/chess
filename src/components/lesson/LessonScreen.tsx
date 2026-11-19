import { AsyncBoundary, useSuspense } from '@data-client/react';
import { Separator, Spinner, Stack } from '@reactive/silk-native';
import { StyleSheet, View } from 'react-native';

import { BrowserOnly } from '@/components/BrowserOnly';
import { Eyebrow } from '@/components/Eyebrow';
import { FootnoteLink } from '@/components/FootnoteLink';
import { StatusHeadline } from '@/components/GameStatus';
import { OpponentChoice } from '@/components/OpponentChoice';
import { Scoresheet } from '@/components/Scoresheet';
import { BoardColumn, BoardColumnPlaceholder, Stage } from '@/components/Stage';
import type { MoveQuality } from '@/analysis/quality';
import { colorName, opposite } from '@/game/replay';
import type { Candidate } from '@/lesson/select';
import { useLesson } from '@/lesson/useLesson';
import type { LessonView } from '@/lesson/view';
import { describeOpponent } from '@/opponent/opponent';
import { getLesson, LESSONS, type LessonId } from '@/resources/lesson';
import { useSettings } from '@/settings/SettingsProvider';
import { qualityLooks } from '@/theme/moveQuality';

import { CandidateList } from './CandidateList';
import { IdeaCard } from './IdeaCard';
import { LessonControls } from './LessonControls';
import { PointingArea } from './PointingArea';
import { TrapCard } from './TrapCard';

/**
 * The lesson `id` as a page. The exported HTML holds only its frame: the
 * lesson loads in the browser, since reading it during the export hangs it.
 */
export function LessonPage({ id }: { readonly id: string }) {
  if (!Object.hasOwn(LESSONS, id)) return <LessonPlaceholder message="There is no lesson here." />;
  return (
    <BrowserOnly fallback={<LessonPlaceholder />}>
      <AsyncBoundary
        fallback={<LessonPlaceholder />}
        errorComponent={({ error }) => <LessonPlaceholder message={error.message} />}
      >
        {/* A game belongs to one lesson: another lesson starts its own. */}
        <LessonScreen key={id} id={id as LessonId} />
      </AsyncBoundary>
    </BrowserOnly>
  );
}

/** The lesson `id`, played on the board, in Explore or Practice. */
function LessonScreen({ id }: { readonly id: LessonId }) {
  const lesson = useSuspense(getLesson, id);
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
    pointRow,
    pointNote,
    leaveNote,
    leave,
    modeState,
    chooseMode,
  } = useLesson(lesson);
  const { mode } = modeState;
  const { auto } = useSettings();
  const learner = lesson.side;
  const rival = opposite(learner);
  const described = describeOpponent(opponent);
  const preview = guidance.preview?.candidate;
  const { trap } = guidance;
  // The card is for notes, or for the notes of a candidate pointed at.
  const ideaCard = guidance.notes.length > 0 || guidance.candidates.length > 0;
  const status = describeStatus(view, {
    title: lesson.title,
    rival: colorName(rival),
    engine: described.name,
    thinking: game.thinking,
    viewing: !game.atLatest,
    auto,
    lineEnded: guidance.lineEnded,
    practice:
      modeState.mode === 'practice' ? { clean: modeState.clean, verdict: game.quality } : undefined,
  });

  const leadsTo = (candidate: Candidate) => {
    if (candidate.variation === undefined) return 'Leaves the guide';
    const into = lesson.variations[candidate.variation];
    return into === view.variation.at(-1) ? undefined : into.name;
  };

  return (
    <Stage
      title={`${lesson.title} · Opening Night`}
      board={
        <BoardColumn
          game={game}
          rival={{
            name: colorName(rival),
            detail: `The guide's moves, then ${described.tagline.toLowerCase()}`,
          }}
          board={board}
        />
      }
      program={
        <Stack gap="5">
          <StatusHeadline
            {...status}
            failure={game.error && { who: described.name, onRetry: game.retry }}
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
                      : `${colorName(rival)}'s likely replies`}
                  </Eyebrow>
                  <CandidateList
                    candidates={guidance.candidates}
                    main={guidance.main}
                    pointed={preview?.move.uci}
                    leadsTo={leadsTo}
                    playable={canPlay}
                    onPlay={play}
                    onPoint={pointRow}
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
  /** In Practice: whether the run is clean, and the label of the move the board shows. */
  readonly practice?: { readonly clean: boolean; readonly verdict?: MoveQuality };
}

/**
 * The panel's headline: where the lesson stands and whose move it is. In
 * Practice, right after the learner's move, it judges that move first.
 */
function describeStatus(
  view: LessonView,
  { title, rival, engine, thinking, viewing, auto, lineEnded, practice }: StatusInput,
) {
  const eyebrow = view.variation.map(({ name }) => name).join(' · ') || title;
  // Beyond the guide on "I choose", nobody replies: the learner moves both sides.
  const playOn = auto ? `play on against ${engine}` : 'play on, moving both sides';
  if (lineEnded)
    return !practice
      ? {
          eyebrow,
          title: 'End of this line.',
          detail: `The guide stops here. Step back to try another branch, or ${playOn}.`,
        }
      : practice.clean
        ? {
            eyebrow,
            title: 'Line complete.',
            detail: 'A clean run: each of your moves from the book, and nothing taken back.',
          }
        : {
            eyebrow,
            title: 'End of this line.',
            detail:
              'This run had a slip or a take-back. Go back to your first move and play it through clean.',
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
      detail: YOUR_MOVE[practice ? 'practice' : 'explore'][viewing ? 'viewing' : 'latest'],
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
    detail: auto
      ? 'Point at a reply to see what it aims for.'
      : 'Point at a reply to see what it aims for, then play it.',
  };
}

/** The detail under "Your move.", by mode and whether an earlier move is shown. */
const YOUR_MOVE = {
  explore: {
    latest: 'Point at a candidate or a note to see it on the board, then play any move you like.',
    viewing: 'Play a move here to try another branch.',
  },
  practice: {
    latest: 'No hints in Practice. Play the move you would choose.',
    viewing: 'Playing here takes a move back, which ends a clean run.',
  },
} as const;

/** The lesson page before the lesson arrives, or with `message` when it can't be shown. */
function LessonPlaceholder({ message }: { readonly message?: string }) {
  return (
    <Stage
      title="Lesson · Opening Night"
      board={
        <BoardColumnPlaceholder>
          {message ? null : <Spinner label="Loading the lesson" />}
        </BoardColumnPlaceholder>
      }
      program={
        <View style={styles.placeholder}>
          <StatusHeadline
            eyebrow="Lesson"
            title={message ? 'Curtain stays down.' : 'Setting the stage…'}
            detail={message ?? 'Loading the lesson.'}
          />
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  placeholder: { minHeight: 200 },
});
