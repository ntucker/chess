import { AsyncBoundary, useSuspense } from '@data-client/react';
import { Separator, Spinner, Stack } from '@reactive/silk-native';
import { StyleSheet, View } from 'react-native';

import { BrowserOnly } from '@/components/BrowserOnly';
import { Eyebrow } from '@/components/Eyebrow';
import { FootnoteLink } from '@/components/FootnoteLink';
import { StatusHeadline } from '@/components/GameStatus';
import { OpponentChoice } from '@/components/OpponentChoice';
import { PlayerBar } from '@/components/PlayerBar';
import { Scoresheet } from '@/components/Scoresheet';
import { BoardColumn, BoardColumnPlaceholder, Stage } from '@/components/Stage';
import { Transport } from '@/components/Transport';
import { useStepKeys } from '@/components/useStepKeys';
import { colorName, opposite } from '@/game/replay';
import { mainCandidate } from '@/lesson/drawings';
import type { Candidate } from '@/lesson/select';
import { useLesson } from '@/lesson/useLesson';
import type { LessonView } from '@/lesson/view';
import { describeOpponent } from '@/opponent/opponent';
import { getLesson, LESSONS, type LessonId } from '@/resources/lesson';

import { CandidateList } from './CandidateList';
import { IdeaCard } from './IdeaCard';

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
        <LessonScreen id={id as LessonId} />
      </AsyncBoundary>
    </BrowserOnly>
  );
}

/** The lesson `id`, played on the board: Explore, with the guide's opponent replying. */
function LessonScreen({ id }: { readonly id: LessonId }) {
  const lesson = useSuspense(getLesson, id);
  const { game, opponent, view, guidance, board, canPlay, play, point, pointed } =
    useLesson(lesson);
  const { moves, ply, goto } = game;
  const learner = lesson.side;
  const rival = opposite(learner);
  const described = describeOpponent(opponent);
  const preview = guidance.preview?.candidate;
  const status = describeStatus(view, {
    title: lesson.title,
    rival: colorName(rival),
    engine: described.name,
    thinking: game.thinking,
    viewing: !game.atLatest,
  });
  useStepKeys(ply, moves.length, goto);

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
          top={
            <PlayerBar
              name={colorName(rival)}
              detail={`The guide's moves, then ${described.tagline.toLowerCase()}`}
              color={rival}
              toMove={game.toMove === rival}
              thinking={game.thinking}
              material={game.material[rival]}
            />
          }
          bottom={
            <PlayerBar
              name="You"
              detail={colorName(learner)}
              color={learner}
              toMove={game.toMove === learner}
              material={game.material[learner]}
            >
              <Transport ply={ply} total={moves.length} onGoto={goto} />
            </PlayerBar>
          }
          evaluated={moves.slice(0, ply)}
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
          {guidance.candidates.length ? (
            <Stack gap="3">
              <Eyebrow>
                {view.learnerToMove ? 'Your candidates' : `${colorName(rival)}'s likely replies`}
              </Eyebrow>
              <CandidateList
                candidates={guidance.candidates}
                main={mainCandidate(guidance.candidates)}
                pointed={pointed}
                leadsTo={leadsTo}
                playable={canPlay}
                onPlay={play}
                onPoint={point}
              />
            </Stack>
          ) : null}
          <IdeaCard title={preview ? `If ${preview.san}` : 'The idea'} notes={guidance.notes} />
          <Separator />
          <Stack gap="3">
            <Eyebrow>Scoresheet</Eyebrow>
            <Scoresheet moves={moves} plies={game.plies} ply={ply} onGoto={goto} />
          </Stack>
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
}

/** The panel's headline: where the lesson stands and whose move it is. */
function describeStatus(
  view: LessonView,
  { title, rival, engine, thinking, viewing }: StatusInput,
) {
  const eyebrow = view.variation.map(({ name }) => name).join(' · ') || title;
  if (view.place === 'beyond')
    return {
      eyebrow,
      title: 'Off the guide.',
      detail: `This position isn't in the lesson. ${engine} plays on; step back to return to the guide.`,
    };
  if (view.place === 'end')
    return {
      eyebrow,
      title: 'End of this line.',
      detail: `The guide stops here. Step back to try another branch, or play on against ${engine}.`,
    };
  if (view.learnerToMove)
    return {
      eyebrow,
      title: 'Your move.',
      detail: viewing
        ? 'Play a move here to try another branch.'
        : 'Point at a candidate to see its idea, then play it or any move you like.',
    };
  return {
    eyebrow,
    title: thinking ? `${rival} is choosing…` : `${rival}'s move.`,
    detail: 'Point at a reply to see what it aims for.',
  };
}

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
