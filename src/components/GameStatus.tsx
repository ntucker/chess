import { Button, Inline, Stack, Text } from '@reactive/silk-native';

import { Eyebrow } from '@/components/Eyebrow';
import type { Color, Ply } from '@/game/replay';
import type { MaiaRating } from '@/resources/maia';

interface Props {
  readonly playerColor: Color;
  /** The latest position of the game. */
  readonly latest: Ply;
  /** The ply on the board when it isn't the latest. */
  readonly viewing?: number;
  readonly total: number;
  readonly rating: MaiaRating;
  readonly thinking: boolean;
  readonly error?: Error;
  readonly onRetry: () => void;
}

/** The headline of the panel: whose move it is, or how the game ended. */
export function GameStatus({
  playerColor,
  latest,
  viewing,
  total,
  rating,
  thinking,
  error,
  onRetry,
}: Props) {
  const { title, detail } = describe(playerColor, latest, rating, thinking);
  return (
    <Stack gap="2">
      <Eyebrow>
        {viewing === undefined
          ? 'Now playing'
          : viewing === 0
            ? 'Replaying · starting position'
            : `Replaying move ${viewing} of ${total}`}
      </Eyebrow>
      <Text role="headingLg" accessibilityRole="header" accessibilityLiveRegion="polite">
        {title}
      </Text>
      <Text role="bodySm" tone="secondary">
        {viewing === undefined
          ? detail
          : 'Play a move here to try a different line, or skip ahead to the latest move.'}
      </Text>
      {error ? (
        <Inline gap="3" align="center">
          <Text role="bodySm" tone="danger">
            Maia didn&apos;t answer.
          </Text>
          <Button size="sm" variant="soft" tone="danger" onPress={onRetry}>
            Try again
          </Button>
        </Inline>
      ) : null}
    </Stack>
  );
}

function describe(playerColor: Color, latest: Ply, rating: MaiaRating, thinking: boolean) {
  const { result } = latest;
  if (result?.winner === playerColor)
    return { title: 'Checkmate. Bravo!', detail: 'You won. Take a bow, then start a new game.' };
  if (result?.winner)
    return { title: 'Checkmate.', detail: 'Maia won this one. Step back through it to see where it turned.' };
  if (result) return { title: 'A draw.', detail: `By ${result.reason}.` };
  if (latest.turn === playerColor)
    return {
      title: 'Your move.',
      detail: latest.move ? `Maia played ${latest.move.san}.` : 'Drag a piece, or tap it and then its square.',
    };
  return {
    title: thinking ? 'Maia is thinking…' : "Maia's move.",
    detail: `Maia plays the way people rated about ${rating} do.`,
  };
}
