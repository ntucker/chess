import { Stack, Text } from '@reactive/silk-native';
import { View } from 'react-native';

import { type DrawingExample, drawingExamples } from '@/board/examples';
import Board from '@/components/Board';
import { Eyebrow } from '@/components/Eyebrow';
import { lastPosition } from '@/game/replay';

import { DevPage, devStyles, FramedBoard } from './DevPage';

/**
 * Every drawing the board can make, one board per idea type. For checking
 * the board and the idea drawings by eye; the app doesn't link here. Previews
 * on hover and press-and-hold are the lesson's own (src/lesson/board.ts).
 */
export function DrawingGallery() {
  return (
    <DevPage
      title="Board drawings"
      intro="Every shape the board draws, in the positions an idea would draw it. Lessons choose the shapes; the board only draws them and reports the pointer."
    >
      <View style={devStyles.grid}>
        {drawingExamples.map((example) => (
          <ExampleCard key={example.title} example={example} />
        ))}
      </View>
    </DevPage>
  );
}

function ExampleCard({ example }: { readonly example: DrawingExample }) {
  const position = lastPosition(example.line);
  const kinds = [...new Set(example.drawings.map((drawing) => drawing.kind))];
  return (
    <Stack gap="3" style={devStyles.card}>
      <Stack gap="1">
        <Eyebrow>{example.title}</Eyebrow>
        <Text role="bodySm">{example.sentence}</Text>
      </Stack>
      <FramedBoard>
        <Board
          fen={position.fen}
          orientation="black"
          turnColor={position.turn}
          dests={{}}
          lastMove={position.move ? [position.move.from, position.move.to] : undefined}
          check={position.check}
          drawings={example.drawings}
          onMove={() => {}}
          dom={{ style: devStyles.fill, scrollEnabled: false }}
        />
      </FramedBoard>
      <Text role="caption" tone="secondary" style={devStyles.mono}>
        {kinds.join(' · ')}
      </Text>
    </Stack>
  );
}
