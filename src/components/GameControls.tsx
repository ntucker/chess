import { Button, Inline, Stack, Text } from '@reactive/silk-native';

import type { Color } from '@/game/replay';

interface Props {
  readonly playerColor: Color;
  readonly ply: number;
  readonly total: number;
  readonly onNewGame: (color: Color) => void;
  readonly onGoto: (ply: number) => void;
}

/** Choosing a side, starting over, and stepping through the moves. */
export function GameControls({ playerColor, ply, total, onNewGame, onGoto }: Props) {
  return (
    <Stack gap="4">
      <Stack gap="2">
        <Text role="label" tone="secondary">
          Play as
        </Text>
        <Inline gap="2">
          {(['white', 'black'] as const).map((color) => (
            <Button
              key={color}
              size="sm"
              variant={color === playerColor ? 'solid' : 'outline'}
              tone="neutral"
              accessibilityState={{ selected: color === playerColor }}
              onPress={() => onNewGame(color)}
            >
              {color === 'white' ? 'White' : 'Black'}
            </Button>
          ))}
          <Button size="sm" variant="soft" tone="accent" onPress={() => onNewGame(playerColor)}>
            Reset
          </Button>
        </Inline>
      </Stack>
      <Inline gap="2">
        <Button
          size="sm"
          variant="outline"
          tone="neutral"
          disabled={ply === 0}
          onPress={() => onGoto(0)}
        >
          « Start
        </Button>
        <Button
          size="sm"
          variant="outline"
          tone="neutral"
          disabled={ply === 0}
          onPress={() => onGoto(ply - 1)}
        >
          ‹ Back
        </Button>
        <Button
          size="sm"
          variant="outline"
          tone="neutral"
          disabled={ply === total}
          onPress={() => onGoto(ply + 1)}
        >
          Forward ›
        </Button>
        <Button
          size="sm"
          variant="outline"
          tone="neutral"
          disabled={ply === total}
          onPress={() => onGoto(total)}
        >
          End »
        </Button>
      </Inline>
    </Stack>
  );
}
