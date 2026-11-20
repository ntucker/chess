import { Button, Stack, Text } from '@reactive/silk-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { gameEnding } from '@/board/ending';
import { type EndingExample, endingExamples } from '@/board/endingExamples';
import Board from '@/components/Board';
import { EndingCard } from '@/components/EndingCard';
import { Eyebrow } from '@/components/Eyebrow';
import { lastPosition } from '@/game/replay';

import { DevPage, devStyles, FramedBoard } from './DevPage';

/**
 * Each way a game can end for the learner, acted out on the board and named
 * over it, with a button to play it again and one to step back a move and
 * forward again, as the move stepper does. The app doesn't link here.
 */
export function EndingGallery() {
  return (
    <DevPage
      title="Game endings"
      intro="How the board tells the learner a game is over: a win, a loss and a draw, as the last move lands."
    >
      <View style={devStyles.grid}>
        {endingExamples.map((example) => (
          <ExampleCard key={example.title} example={example} />
        ))}
      </View>
    </DevPage>
  );
}

function ExampleCard({ example }: { readonly example: EndingExample }) {
  // Each showing remounts the board and the card, so the ending plays from its start.
  const [showing, setShowing] = useState(0);
  // Stepping back keeps the board mounted, as in a game: the ending must
  // clear from it, and play again when the last move is made once more.
  const [back, setBack] = useState(false);
  const position = lastPosition(back ? example.line.slice(0, -1) : example.line);
  const ending = gameEnding(position, example.learner);
  return (
    <Stack gap="3" style={devStyles.card}>
      <Stack gap="1">
        <Eyebrow>{example.title}</Eyebrow>
        <Text role="bodySm">{example.sentence}</Text>
      </Stack>
      <FramedBoard key={showing}>
        <Board
          fen={position.fen}
          orientation={example.learner}
          turnColor={position.turn}
          dests={{}}
          lastMove={position.move ? [position.move.from, position.move.to] : undefined}
          check={position.check}
          ending={ending}
          onMove={() => {}}
          dom={{ style: devStyles.fill, scrollEnabled: false }}
        />
        {ending ? (
          <EndingCard ending={ending} rival="Maia 1500" orientation={example.learner} />
        ) : null}
      </FramedBoard>
      <View style={styles.buttons}>
        <Button size="sm" variant="soft" onPress={() => setShowing(showing + 1)}>
          Play again
        </Button>
        <Button size="sm" variant="soft" onPress={() => setBack(!back)}>
          {back ? 'Step forward' : 'Step back'}
        </Button>
      </View>
    </Stack>
  );
}

const styles = StyleSheet.create({
  buttons: { flexDirection: 'row', gap: 8 },
});
