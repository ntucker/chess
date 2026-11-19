import { useSuspense } from "@data-client/react";
import {
  Button,
  Inline,
  Separator,
  Spinner,
  Stack,
  Text,
} from "@reactive/silk-native";
import { StyleSheet, View } from "react-native";

import { Eyebrow } from "@/components/Eyebrow";
import { OpponentChoice } from "@/components/OpponentChoice";
import { PlayerBar } from "@/components/PlayerBar";
import { Scoresheet } from "@/components/Scoresheet";
import { BoardColumn, BoardColumnPlaceholder, Stage } from "@/components/Stage";
import { Transport } from "@/components/Transport";
import { useStepKeys } from "@/components/useStepKeys";
import { colorName, opposite } from "@/game/replay";
import { mainCandidate } from "@/lesson/drawings";
import type { Lesson } from "@/lesson/lesson";
import type { Candidate } from "@/lesson/select";
import { useLesson } from "@/lesson/useLesson";
import type { LessonView } from "@/lesson/view";
import { describeOpponent, type Opponent } from "@/opponent/opponent";
import { getLesson, type LessonId } from "@/resources/lesson";
import { useSettings } from "@/settings/SettingsProvider";

import { CandidateList } from "./CandidateList";
import { IdeaCard } from "./IdeaCard";

/** Lesson pages aren't linked from the app yet, so search engines skip them. */
const NO_INDEX = <meta name="robots" content="noindex" />;

/** The lesson `id`, played on the board: Explore, with the guide's opponent replying. */
export function LessonScreen({ id }: { readonly id: LessonId }) {
  const lesson = useSuspense(getLesson, id);
  const { opponent } = useSettings();
  const { game, view, guidance, board, canPlay, play, point, pointed } =
    useLesson(lesson);
  const { line, ply, goto } = game;
  const learner = lesson.side;
  const rival = opposite(learner);
  const preview = guidance.preview?.candidate;
  const status = describeStatus(view, {
    lesson,
    opponent,
    thinking: game.thinking,
    viewing: !game.atLatest,
  });
  useStepKeys(ply, line.length, goto);

  const leadsTo = (candidate: Candidate) => {
    if (candidate.variation === undefined) return "Leaves the guide";
    const into = lesson.variations[candidate.variation];
    return into === view.variation.at(-1) ? undefined : into.name;
  };

  return (
    <Stage
      title={`${lesson.title} · Opening Night`}
      head={NO_INDEX}
      board={
        <BoardColumn
          top={
            <PlayerBar
              name={colorName(rival)}
              detail={`The guide's moves, then ${describeOpponent(opponent).tagline.toLowerCase()}`}
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
              <Transport ply={ply} total={line.length} onGoto={goto} />
            </PlayerBar>
          }
          evaluated={line.slice(0, ply)}
          board={board}
        />
      }
      program={
        <Stack gap="5">
          <Stack gap="2">
            <Eyebrow>{status.eyebrow}</Eyebrow>
            <Text
              role="headingLg"
              accessibilityRole="header"
              accessibilityLiveRegion="polite"
            >
              {status.title}
            </Text>
            <Text role="bodySm" tone="secondary">
              {status.detail}
            </Text>
            {game.error ? (
              <Inline gap="3" align="center">
                <Text role="bodySm" tone="danger">
                  {describeOpponent(opponent).name} didn&apos;t answer.
                </Text>
                <Button
                  size="sm"
                  variant="soft"
                  tone="danger"
                  onPress={game.retry}
                >
                  Try again
                </Button>
              </Inline>
            ) : null}
          </Stack>
          <Separator />
          {guidance.candidates.length ? (
            <Stack gap="3">
              <Eyebrow>
                {view.learnerToMove
                  ? "Your candidates"
                  : `${colorName(rival)}'s likely replies`}
              </Eyebrow>
              <CandidateList
                candidates={guidance.candidates}
                main={mainCandidate(guidance.candidates)}
                pointed={pointed}
                leadsTo={leadsTo}
                canPlay={canPlay}
                onPlay={play}
                onPoint={point}
              />
            </Stack>
          ) : null}
          <IdeaCard
            title={preview ? `If ${preview.san}` : "The idea"}
            notes={guidance.notes}
          />
          <Separator />
          <Stack gap="3">
            <Eyebrow>Scoresheet</Eyebrow>
            <Scoresheet
              plies={game.plies}
              qualities={game.qualities}
              ply={ply}
              onGoto={goto}
            />
          </Stack>
          <OpponentChoice />
        </Stack>
      }
    />
  );
}

interface StatusInput {
  readonly lesson: Lesson;
  readonly opponent: Opponent;
  readonly thinking: boolean;
  /** The board shows an earlier move than the latest. */
  readonly viewing: boolean;
}

/** The panel's headline: where the lesson stands and whose move it is. */
function describeStatus(
  view: LessonView,
  { lesson, opponent, thinking, viewing }: StatusInput,
) {
  const eyebrow =
    view.variation.map(({ name }) => name).join(" · ") || lesson.title;
  const rival = colorName(opposite(lesson.side));
  const engine = describeOpponent(opponent);
  if (view.place === "beyond")
    return {
      eyebrow,
      title: "Off the guide.",
      detail: `This position isn't in the lesson. ${engine.name} plays on; step back to return to the guide.`,
    };
  if (view.place === "end")
    return {
      eyebrow,
      title: "End of this line.",
      detail: `The guide stops here. Step back to try another branch, or play on against ${engine.name}.`,
    };
  if (view.learnerToMove)
    return {
      eyebrow,
      title: "Your move.",
      detail: viewing
        ? "Play a move here to try another branch."
        : "Point at a candidate to see its idea, then play it or any move you like.",
    };
  return {
    eyebrow,
    title: thinking ? `${rival} is choosing…` : `${rival}'s move.`,
    detail: "Point at a reply to see what it aims for.",
  };
}

/** The lesson page before the lesson arrives, or with `message` when it can't be shown. */
export function LessonPlaceholder({ message }: { readonly message?: string }) {
  return (
    <Stage
      title="Lesson · Opening Night"
      head={NO_INDEX}
      board={
        <BoardColumnPlaceholder>
          {message ? null : <Spinner label="Loading the lesson" />}
        </BoardColumnPlaceholder>
      }
      program={
        <View style={styles.placeholder}>
          <Stack gap="2">
            <Eyebrow>Lesson</Eyebrow>
            <Text role="headingLg" accessibilityRole="header">
              {message ? "Curtain stays down." : "Setting the stage…"}
            </Text>
            <Text role="bodySm" tone="secondary">
              {message ?? "Loading the lesson."}
            </Text>
          </Stack>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  placeholder: { minHeight: 200 },
});
