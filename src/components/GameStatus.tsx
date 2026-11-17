import { Badge, Button, Inline, Spinner, Stack, Text } from '@reactive/silk-native';

import type { Color, Ply } from '@/game/replay';

interface Props {
  readonly playerColor: Color;
  /** The latest position of the game. */
  readonly latest: Ply;
  /** The ply on the board when it isn't the latest. */
  readonly viewing?: number;
  readonly total: number;
  readonly thinking: boolean;
  readonly error?: Error;
  readonly onRetry: () => void;
}

/** Whose move it is, how the game ended, or why Maia hasn't answered. */
export function GameStatus({
  playerColor,
  latest,
  viewing,
  total,
  thinking,
  error,
  onRetry,
}: Props) {
  return (
    <Stack gap="2">
      <Inline gap="2" justify="between">
        <Text role="heading">{headline(playerColor, latest, thinking)}</Text>
        {thinking ? <Spinner size="sm" /> : null}
      </Inline>
      {viewing !== undefined ? (
        <Badge tone="accent">{`Viewing move ${viewing} of ${total}`}</Badge>
      ) : null}
      {error && !thinking ? (
        <Stack gap="2">
          <Text tone="danger" role="bodySm">
            Maia didn&apos;t answer. Check your connection and try again.
          </Text>
          <Inline>
            <Button size="sm" variant="soft" tone="danger" onPress={onRetry}>
              Try again
            </Button>
          </Inline>
        </Stack>
      ) : null}
    </Stack>
  );
}

function headline(playerColor: Color, latest: Ply, thinking: boolean): string {
  const { result } = latest;
  if (result) {
    if (!result.winner) return `Draw by ${result.reason}`;
    return result.winner === playerColor ? 'Checkmate. You win!' : 'Checkmate. Maia wins.';
  }
  if (latest.turn === playerColor) return 'Your move';
  return thinking ? 'Maia is thinking…' : "Maia's move";
}
