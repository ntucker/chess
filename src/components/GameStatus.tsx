import { Button, Inline, Stack, Text } from '@reactive/silk-native';
import { StyleSheet, View } from 'react-native';

import { Eyebrow } from '@/components/Eyebrow';
import { type Destination, PlaceLink } from '@/components/PlaceLink';
import { NEW_VERSION, NewVersionError, reload } from '@/files/newVersion';
import type { Color, Position } from '@/game/replay';
import { describeOpponent, type Opponent } from '@/opponent/opponent';
import { narrowLength, narrowPart } from '@/theme/narrow';
import { NarrowOnly } from '@/theme/NarrowOnly';
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
      failure={error && { who: describeOpponent(game.opponent).name, error, onRetry }}
    />
  );
}

interface HeadlineProps {
  readonly eyebrow: string;
  readonly title: string;
  readonly detail: string;
  /** The opponent `who` didn't answer with `error`, and `onRetry` asks it again. */
  readonly failure?: Failure;
  /**
   * The header names the line on a narrow web page (Stage's `place`), so the headline
   * leaves its eyebrow out there.
   */
  readonly eyebrowInHeader?: boolean;
  /** The eyebrow names where the page is, and links to the screen listing the others (`PlaceLink`). */
  readonly eyebrowLink?: Destination;
  /**
   * The headline only says whose move it is, which the name bars show too,
   * and how to use the screen, which the learner has seen. A narrow web page
   * doesn't draw it, to give its room to the moves, but screen readers still
   * announce it. A failure always shows.
   */
  readonly routine?: boolean;
  /**
   * On a narrow web page, draw the headline as one short paragraph, its title
   * run in before its detail, to give its room to the panel's panes. Screen
   * readers hear the full headline either way.
   */
  readonly short?: boolean;
  /** The title only says whose move it is, which the name bars show: the short paragraph leaves it out. */
  readonly turn?: boolean;
}

/** A panel's headline, announced as it changes, with a retry when the opponent didn't answer. */
export function StatusHeadline({
  eyebrow,
  title,
  detail,
  failure,
  eyebrowInHeader,
  eyebrowLink,
  routine,
  short,
  turn,
}: HeadlineProps) {
  const label = (
    <PlaceLink to={eyebrowLink}>
      {(active) => <Eyebrow tone={active ? 'primary' : 'secondary'}>{eyebrow}</Eyebrow>}
    </PlaceLink>
  );
  const full = (
    <>
      {eyebrowInHeader ? <View {...narrowPart('wide-only')}>{label}</View> : label}
      <Text
        role="headingLg"
        accessibilityRole="header"
        accessibilityLiveRegion="polite"
        style={styles.title}
      >
        {title}
      </Text>
      <Text role="bodySm" tone="secondary">
        {detail}
      </Text>
    </>
  );
  return (
    <Stack gap="2" {...(routine && !failure ? narrowPart('wide-only-spoken') : {})}>
      {short ? (
        <Stack gap="2" {...narrowPart('wide-only-spoken')}>
          {full}
        </Stack>
      ) : (
        full
      )}
      {short && !routine ? (
        <NarrowOnly>
          {/* What the full headline says, so screen readers skip it. */}
          <Text role="bodySm" tone="secondary" aria-hidden>
            {turn ? null : (
              <Text role="bodySm" tone="primary" style={styles.runIn}>
                {`${title} `}
              </Text>
            )}
            {detail}
          </Text>
        </NarrowOnly>
      ) : null}
      {failure ? <FailureLine {...failure} /> : null}
    </Stack>
  );
}

interface Failure {
  readonly who: string;
  readonly error: Error;
  readonly onRetry: () => void;
}

/**
 * The opponent didn't answer, with a retry; or, when a newer deploy removed
 * the engine's file so asking again can't help, a reload.
 */
function FailureLine({ who, error, onRetry }: Failure) {
  const { message, action, onPress } =
    error instanceof NewVersionError
      ? { message: NEW_VERSION, action: 'Reload', onPress: reload }
      : { message: `${who} didn't answer.`, action: 'Try again', onPress: onRetry };
  return (
    <Inline gap="3" align="center">
      <Text role="bodySm" tone="danger">
        {message}
      </Text>
      <Button size="sm" variant="soft" tone="danger" onPress={onPress}>
        {action}
      </Button>
    </Inline>
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

/** The headline's size: its role's, smaller on a narrow web page (narrow.css). */
const HEADLINE = typography.headingLg;
const TITLE_SIZE = narrowLength('headline-size', HEADLINE.size);

const styles = StyleSheet.create({
  title: { fontSize: TITLE_SIZE.value, lineHeight: TITLE_SIZE.times(HEADLINE.lineHeight).value },
  runIn: { fontWeight: '600' },
});
