import { useController, useLoading } from '@data-client/react';
import { Stack, Surface } from '@reactive/silk-native';
import Head from 'expo-router/head';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Board from '@/components/Board';
import { GameControls } from '@/components/GameControls';
import { GameStatus } from '@/components/GameStatus';
import { MoveList } from '@/components/MoveList';
import { type Color, replay, toUci } from '@/game/replay';
import { useGame } from '@/game/useGame';
import { getMaiaMove, type MaiaRating } from '@/resources/maia';

/** Maia's strength for now; picking it comes with the opening lessons. */
const RATING: MaiaRating = 1500;

export default function PlayScreen() {
  const { playerColor, line, ply, plies, current, latest, dispatch } = useGame();
  const ctrl = useController();

  const [askMaia, thinking, error] = useLoading(async (after: readonly string[]) => {
    const { top_move } = await ctrl.fetch(getMaiaMove, { rating: RATING }, after);
    if (replay([...after, top_move]).length !== after.length + 2) {
      throw new Error(`Maia answered with an illegal move: ${top_move}`);
    }
    dispatch({ type: 'reply', after, uci: top_move });
  });

  const atLatest = ply === line.length;
  // While Maia thinks the player can still go back and try another move.
  const canMove = !current.result && current.turn === playerColor && !(atLatest && thinking);

  const handleMove = (from: string, to: string) => {
    const uci = toUci(current, from, to);
    const next = [...line.slice(0, ply), uci];
    dispatch({ type: 'move', uci });
    if (!replay(next).at(-1)?.result) askMaia(next);
  };

  const newGame = (color: Color) => {
    dispatch({ type: 'newGame', playerColor: color });
    if (color === 'black') askMaia([]);
  };

  return (
    <Surface elevation="sunken" radius="none" style={styles.fill}>
      <Head>
        <title>Opening Night</title>
      </Head>
      <SafeAreaView style={styles.fill}>
        <ScrollView contentContainerStyle={styles.page}>
          <View style={styles.board}>
            <Board
              fen={current.fen}
              orientation={playerColor}
              turnColor={current.turn}
              movableColor={canMove ? playerColor : undefined}
              dests={current.dests}
              lastMove={current.move ? [current.move.from, current.move.to] : undefined}
              check={current.check}
              onMove={handleMove}
              dom={{ style: styles.fill, scrollEnabled: false }}
            />
          </View>
          <Surface elevation="raised" radius="lg" style={styles.panel}>
            <Stack gap="4">
              <GameStatus
                playerColor={playerColor}
                latest={latest}
                viewing={atLatest ? undefined : ply}
                total={line.length}
                thinking={thinking}
                error={error}
                onRetry={() => askMaia(line)}
              />
              <GameControls
                playerColor={playerColor}
                ply={ply}
                total={line.length}
                onNewGame={newGame}
                onGoto={(target) => dispatch({ type: 'goto', ply: target })}
              />
              <MoveList
                plies={plies}
                ply={ply}
                onGoto={(target) => dispatch({ type: 'goto', ply: target })}
              />
            </Stack>
          </Surface>
        </ScrollView>
      </SafeAreaView>
    </Surface>
  );
}

// Board and panel sit side by side when there's room and wrap into a column
// when there isn't, without measuring the window (which the server can't).
const styles = StyleSheet.create({
  fill: { flex: 1 },
  page: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: 24,
    padding: 16,
  },
  board: { flexGrow: 1, flexShrink: 1, flexBasis: 320, maxWidth: 640, aspectRatio: 1 },
  panel: { flexGrow: 1, flexBasis: 280, maxWidth: 400, padding: 16 },
});
