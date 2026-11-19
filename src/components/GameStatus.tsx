import { Button, Inline, Stack, Text } from '@reactive/silk-native';
import { StyleSheet, View } from 'react-native';

import { Eyebrow } from '@/components/Eyebrow';
import type { Color, Position } from '@/game/replay';
import { describeOpponent, type Opponent } from '@/opponent/opponent';
import { phoneLength, phonePart } from '@/theme/phone';
import { typography } from '@/theme/theme';

interface Props {
  readonly playerColor: Color;
  /** The latest position of the game. */
  readonly latest: Position;
  /** The ply on the board when it isn't the latest. */
  readonly viewing?: number;
  readonly total: number;
  readonly opponent: Opponent;
  readonly thinking: boolean;
  readonly error?: Error;
  readonly onRetry: () => void;
}

/** The headline of the panel: whose move it is, or how the game ended. */
export function GameStatus({ error, onRetry, ...game }: Props) {
  return (
    <StatusHeadline
      {...describe(game)}
      failure={error && { who: describeOpponent(game.opponent).name, onRetry }}
    />
  );
}

interface HeadlineProps {
  readonly eyebrow: string;
  readonly title: string;
  readonly detail: string;
  /** The opponent `who` didn't answer, and `onRetry` asks it again. */
  readonly failure?: { readonly who: string; readonly onRetry: () => void };
  /**
   * The header names the line on a narrow web page (Stage's `place`), so the headline
   * leaves its eyebrow out there.
   */
  readonly eyebrowInHeader?: boolean;
  /** The detail tells how to use the screen, and the learner has seen it: a narrow web page leaves it out. */
  readonly seenHint?: boolean;
}

/** A panel's headline, announced as it changes, with a retry when the opponent didn't answer. */
export function StatusHeadline({
  eyebrow,
  title,
  detail,
  failure,
  eyebrowInHeader,
  seenHint,
}: HeadlineProps) {
  const label = <Eyebrow>{eyebrow}</Eyebrow>;
  return (
    <Stack gap="2">
      {eyebrowInHeader ? <View {...phonePart('wide-only')}>{label}</View> : label}
      <Text
        role="headingLg"
        accessibilityRole="header"
        accessibilityLiveRegion="polite"
        style={styles.title}
      >
        {title}
      </Text>
      <Text {...(seenHint ? phonePart('wide-only') : {})} role="bodySm" tone="secondary">
        {detail}
      </Text>
      {failure ? (
        <Inline gap="3" align="center">
          <Text role="bodySm" tone="danger">
            {failure.who} didn&apos;t answer.
          </Text>
          <Button size="sm" variant="soft" tone="danger" onPress={failure.onRetry}>
            Try again
          </Button>
        </Inline>
      ) : null}
    </Stack>
  );
}

type Game = Omit<Props, 'error' | 'onRetry'>;

function describe({ viewing, total, ...game }: Game) {
  const { title, detail } = describeLatest(game);
  if (viewing === undefined) return { eyebrow: 'Now playing', title, detail };
  return {
    eyebrow:
      viewing === 0 ? 'Replaying · starting position' : `Replaying move ${viewing} of ${total}`,
    title,
    detail: 'Play a move here to try a different line, or skip ahead to the latest move.',
  };
}

function describeLatest({
  playerColor,
  latest,
  opponent,
  thinking,
}: Omit<Game, 'viewing' | 'total'>) {
  const { result } = latest;
  const { name, style } = describeOpponent(opponent);
  if (result?.winner === playerColor)
    return { title: 'Checkmate. Bravo!', detail: 'You won. Take a bow, then start a new game.' };
  if (result?.winner)
    return {
      title: 'Checkmate.',
      detail: `${name} won this one. Step back through it to see where it turned.`,
    };
  if (result) return { title: 'A draw.', detail: `By ${result.reason}.` };
  if (latest.turn === playerColor)
    return {
      title: 'Your move.',
      detail: latest.move
        ? `${name} played ${latest.move.san}.`
        : 'Drag a piece, or tap it and then its square.',
    };
  return {
    title: thinking ? `${name} is thinking…` : `${name}'s move.`,
    detail: style,
  };
}

/** The headline's size: its role's, a size smaller on a narrow web page. */
const HEADLINE = typography.headingLg;
const TITLE_SIZE = phoneLength('headline-size', HEADLINE.size);

const styles = StyleSheet.create({
  title: { fontSize: TITLE_SIZE.value, lineHeight: TITLE_SIZE.times(HEADLINE.lineHeight).value },
});
