import { Button, Inline, Stack, Text } from '@reactive/silk-native';

import { Eyebrow } from '@/components/Eyebrow';
import type { Color, Position } from '@/game/replay';
import { describeOpponent, type Opponent } from '@/opponent/opponent';

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
  const { eyebrow, title, detail } = describe(game);
  return (
    <Stack gap="2">
      <Eyebrow>{eyebrow}</Eyebrow>
      <Text role="headingLg" accessibilityRole="header" accessibilityLiveRegion="polite">
        {title}
      </Text>
      <Text role="bodySm" tone="secondary">
        {detail}
      </Text>
      {error ? (
        <Inline gap="3" align="center">
          <Text role="bodySm" tone="danger">
            {describeOpponent(game.opponent).name} didn&apos;t answer.
          </Text>
          <Button size="sm" variant="soft" tone="danger" onPress={onRetry}>
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
    eyebrow: viewing === 0 ? 'Replaying · starting position' : `Replaying move ${viewing} of ${total}`,
    title,
    detail: 'Play a move here to try a different line, or skip ahead to the latest move.',
  };
}

function describeLatest({ playerColor, latest, opponent, thinking }: Omit<Game, 'viewing' | 'total'>) {
  const { result } = latest;
  const { name, style } = describeOpponent(opponent);
  if (result?.winner === playerColor)
    return { title: 'Checkmate. Bravo!', detail: 'You won. Take a bow, then start a new game.' };
  if (result?.winner)
    return { title: 'Checkmate.', detail: `${name} won this one. Step back through it to see where it turned.` };
  if (result) return { title: 'A draw.', detail: `By ${result.reason}.` };
  if (latest.turn === playerColor)
    return {
      title: 'Your move.',
      detail: latest.move ? `${name} played ${latest.move.san}.` : 'Drag a piece, or tap it and then its square.',
    };
  return {
    title: thinking ? `${name} is thinking…` : `${name}'s move.`,
    detail: style,
  };
}
