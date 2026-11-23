import { Button, Inline, Stack, Text } from '@reactive/silk-native';
import type { Href } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Eyebrow } from '@/components/Eyebrow';
import { type Destination, PlaceLink } from '@/components/PlaceLink';
import { ReviewGameButton } from '@/components/ReviewLinks';
import { Tip } from '@/components/Tip';
import { NEW_VERSION, NewVersionError, reload } from '@/files/newVersion';
import { endingHeadline, resultVerdict } from '@/game/ending';
import type { Color, Position } from '@/game/replay';
import { describeOpponent, type Opponent } from '@/opponent/opponent';
import { narrowLength, narrowStyles } from '@/theme/narrow';
import { NarrowOnly, useNarrowPart, useNarrowStyles } from '@/theme/Narrow';
import { fonts, typography } from '@/theme/theme';

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
  /** The game's review, which the headline offers once the game ends. */
  readonly review: Href;
}

/** The headline of the panel: whose move it is, or how the game ended, with its review. */
export function GameStatus({ error, onRetry, review, ...game }: Props) {
  const ended = game.latest.result && game.viewing === undefined;
  return (
    <StatusHeadline
      {...describe(game)}
      failure={error && { who: describeOpponent(game.opponent).name, error, onRetry }}
      action={ended ? <ReviewGameButton href={review} /> : null}
    />
  );
}

export interface HeadlineProps {
  readonly eyebrow: string;
  readonly title: string;
  /** Why the title says what it does, in a tooltip on it: "A brief appearance." says why there's no verdict. */
  readonly titleTip?: string;
  readonly detail: string;
  /** The opponent `who` didn't answer with `error`, and `onRetry` asks it again. */
  readonly failure?: Failure;
  /**
   * The header names the line on a narrow page (Stage's `place`), so the headline
   * leaves its eyebrow out there.
   */
  readonly eyebrowInHeader?: boolean;
  /** The eyebrow names where the page is, and links to the screen listing the others (`PlaceLink`). */
  readonly eyebrowLink?: Destination;
  /**
   * What a narrow page draws of the headline, as one short line that
   * leaves its room to the panel below: the title run in before the detail
   * (`all`); the detail alone, when the title only says whose move it is,
   * which the name bars show (`detail`); or nothing, when the detail is how
   * to use the screen too, which the learner has seen, or the screen tells
   * it elsewhere or leaves it untold (`none`; a failure still draws the
   * detail). Without it, the narrow page draws the full
   * headline. Screen readers hear the full headline either way.
   */
  readonly news?: News;
  /** What the headline leads to, under it: "Review the game" when a game ends. */
  readonly action?: ReactNode;
}

export type News = 'all' | 'detail' | 'none';

/**
 * `children`, with `tip` in a tooltip when there is one (`Tip`), held to their
 * own width; `focusable` for children that take no focus, such as a title.
 */
function Tipped({
  tip,
  focusable,
  children,
}: {
  readonly tip?: string;
  readonly focusable?: boolean;
  readonly children: ReactNode;
}) {
  return tip ? (
    <Tip tip={tip} focusable={focusable} style={tipped.box}>
      {children}
    </Tip>
  ) : (
    children
  );
}

/** A panel's headline, announced as it changes, with a retry when the opponent didn't answer. */
export function StatusHeadline({
  eyebrow,
  title,
  titleTip,
  detail,
  failure,
  eyebrowInHeader,
  eyebrowLink,
  news,
  action,
}: HeadlineProps) {
  const part = useNarrowPart();
  const styles = useNarrowStyles(STYLES);
  const label = (
    <PlaceLink to={eyebrowLink}>
      {(active) => <Eyebrow tone={active ? 'primary' : 'secondary'}>{eyebrow}</Eyebrow>}
    </PlaceLink>
  );
  // A failure's retry needs the detail beside it.
  const drawn = news === 'none' && failure ? 'detail' : news;
  const short = drawn === 'all' || drawn === 'detail';
  return (
    <Stack gap="2" {...part(drawn === 'none' && 'wide-only-spoken')}>
      {/* With a short line drawn, a narrow page keeps the full headline for screen readers only. */}
      <Stack gap="2" {...part(short && 'wide-only-spoken')}>
        {eyebrowInHeader ? <View {...part('wide-only')}>{label}</View> : label}
        {/*
          The live region announces the title with its tip, and stays put while a
          tooltip comes and goes around it. On a narrow page drawing a short line,
          the focusable title is visually hidden, yet keyboard users still reach
          its tip: the short line, hidden from screen readers, can't take focus.
        */}
        <View accessibilityLiveRegion="polite">
          <Tipped tip={titleTip} focusable>
            <Text role="headingLg" accessibilityRole="header" style={styles.title}>
              {title}
            </Text>
          </Tipped>
        </View>
        <Text role="bodySm" tone="secondary">
          {detail}
        </Text>
      </Stack>
      {short ? (
        // What the full headline says, so screen readers skip it, tip and all.
        <NarrowOnly aria-hidden>
          <Tipped tip={drawn === 'all' ? titleTip : undefined}>
            <Text role="bodySm" tone="secondary">
              {drawn === 'all' ? (
                <Text role="bodySm" tone="primary" style={styles.runIn}>
                  {`${title} `}
                </Text>
              ) : null}
              {detail}
            </Text>
          </Tipped>
        </NarrowOnly>
      ) : null}
      {failure ? <FailureLine {...failure} /> : null}
      {action}
    </Stack>
  );
}

interface Failure {
  readonly who: string;
  readonly error: Error;
  readonly onRetry: () => void;
}

function FailureLine(failure: Failure) {
  const { message, button } = describeFailure(failure);
  return (
    <Inline gap="3" align="center">
      <Text role="bodySm" tone="danger">
        {message}
      </Text>
      {button ? (
        <Button size="sm" variant="soft" tone="danger" onPress={button.onPress}>
          {button.label}
        </Button>
      ) : null}
    </Inline>
  );
}

/**
 * The opponent didn't answer, with a retry; or, when a newer deploy removed
 * the engine's file so asking again can't help, a reload, or what the app
 * needs when a reload can't help either.
 */
function describeFailure({ who, error, onRetry }: Failure): {
  message: string;
  button?: { label: string; onPress: () => void };
} {
  if (!(error instanceof NewVersionError))
    return { message: `${who} didn't answer.`, button: { label: 'Try again', onPress: onRetry } };
  if (error.needs) return { message: `${who} needs ${error.needs}.` };
  return { message: NEW_VERSION, button: { label: 'Reload', onPress: reload } };
}

type Game = Omit<Props, 'error' | 'onRetry' | 'review'>;

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
  if (result) return endingHeadline(resultVerdict(result, playerColor), name);
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

/** The headline's size: its role's, smaller on a narrow page. */
const HEADLINE = typography.headingLg;
const TITLE_SIZE = narrowLength('headline-size', HEADLINE.size);

/** The run-in title's size: bodySm's, plus the serif's smaller x-height. */
const RUN_IN_SIZE = typography.bodySm.size + 2;

const STYLES = narrowStyles((px) => ({
  title: { fontSize: px(TITLE_SIZE), lineHeight: px(TITLE_SIZE.times(HEADLINE.lineHeight)) },
  // The display serif carries the hierarchy (theme.ts), a step up from the detail's size.
  runIn: { fontFamily: fonts.display, fontSize: RUN_IN_SIZE },
}));

const tipped = StyleSheet.create({ box: { alignSelf: 'flex-start' } });
