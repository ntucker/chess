import Ionicons from '@expo/vector-icons/Ionicons';
import { Button, Separator, Stack, Surface, useTheme } from '@reactive/silk-native';
import Head from 'expo-router/head';
import { useEffect, useEffectEvent, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Board from '@/components/Board';
import { Eyebrow } from '@/components/Eyebrow';
import { GameStatus } from '@/components/GameStatus';
import { Header } from '@/components/Header';
import { PLAYER_BAR_HEIGHT, PlayerBar } from '@/components/PlayerBar';
import { Scoresheet } from '@/components/Scoresheet';
import { SideChooser } from '@/components/SideChooser';
import { Transport } from '@/components/Transport';
import { type Color, opposite } from '@/game/replay';
import { useGame } from '@/game/useGame';
import type { MaiaRating } from '@/resources/maia';

/** Maia's strength for now; picking it comes with the opening lessons. */
const RATING: MaiaRating = 1500;

export default function PlayScreen() {
  const game = useGame(RATING);
  const { playerColor, line, ply, plies, current, latest, thinking, error, goto } = game;
  const [nextColor, setNextColor] = useState<Color>(playerColor);
  const { theme } = useTheme();
  const { color } = theme.semantic;

  const atLatest = ply === line.length;
  // While Maia thinks the player can still go back and try another move.
  const canMove = !current.result && current.turn === playerColor && !(atLatest && thinking);
  const maiaColor = opposite(playerColor);
  // Nothing to lose yet: the player hasn't moved.
  const untouched = line.length <= (playerColor === 'black' ? 1 : 0);

  const chooseSide = (side: Color) => {
    setNextColor(side);
    if (untouched && side !== playerColor) game.newGame(side);
  };

  // Arrow keys step through the moves on the web.
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    const targets: Record<string, number> = {
      ArrowLeft: ply - 1,
      ArrowRight: ply + 1,
      Home: 0,
      End: line.length,
    };
    if (event.key in targets) {
      event.preventDefault();
      goto(targets[event.key]);
    }
  });
  useEffect(() => {
    if (process.env.EXPO_OS !== 'web') return;
    const listener = (event: KeyboardEvent) => onKey(event);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  const opponent = (
    <PlayerBar
      name="Maia"
      detail={`Plays like a ${RATING} · ${maiaColor === 'white' ? 'White' : 'Black'}`}
      color={maiaColor}
      toMove={!latest.result && latest.turn === maiaColor}
      thinking={thinking}
    />
  );
  const you = (
    <PlayerBar
      name="You"
      detail={playerColor === 'white' ? 'White' : 'Black'}
      color={playerColor}
      toMove={!latest.result && latest.turn === playerColor}
    >
      <Transport ply={ply} total={line.length} onGoto={goto} />
    </PlayerBar>
  );

  return (
    <View style={[styles.fill, { backgroundColor: color.surface }, spotlight(theme.colorScheme)]}>
      <Head>
        <title>Opening Night</title>
      </Head>
      <SafeAreaView style={styles.fill}>
        <ScrollView contentContainerStyle={styles.page}>
          <View style={styles.header}>
            <Header />
          </View>
          <View style={styles.stage}>
            <View style={styles.boardColumn}>
              {opponent}
              <View style={[styles.frame, { borderColor: color.borderSubtle }]}>
                <View style={styles.boardClip}>
                  <Board
                    fen={current.fen}
                    orientation={playerColor}
                    turnColor={current.turn}
                    movableColor={canMove ? playerColor : undefined}
                    dests={current.dests}
                    lastMove={current.move ? [current.move.from, current.move.to] : undefined}
                    check={current.check}
                    onMove={game.move}
                    dom={{ style: styles.fill, scrollEnabled: false }}
                  />
                </View>
              </View>
              {you}
            </View>

            <Surface elevation="raised" radius="lg" border="subtle" style={styles.program}>
              <Stack gap="5">
                <GameStatus
                  playerColor={playerColor}
                  latest={latest}
                  viewing={atLatest ? undefined : ply}
                  total={line.length}
                  rating={RATING}
                  thinking={thinking}
                  error={error}
                  onRetry={game.retry}
                />
                <Separator />
                <Stack gap="3">
                  <Eyebrow>Play as</Eyebrow>
                  <View style={styles.row}>
                    <View style={styles.fill}>
                      <SideChooser value={nextColor} onChange={chooseSide} />
                    </View>
                    <Button tone="accent" variant="solid" onPress={() => game.newGame(nextColor)}>
                      <Ionicons name="refresh" size={15} /> New game
                    </Button>
                  </View>
                </Stack>
                <Separator />
                <Stack gap="3">
                  <Eyebrow>Scoresheet</Eyebrow>
                  <Scoresheet plies={plies} ply={ply} onGoto={goto} />
                </Stack>
              </Stack>
            </Surface>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

/** A soft pool of light from above, on platforms that draw CSS gradients. */
const spotlight = (scheme: 'light' | 'dark') => ({
  backgroundImage:
    scheme === 'dark'
      ? 'radial-gradient(ellipse 70% 55% at 35% -5%, rgba(217, 164, 65, 0.22), rgba(217, 164, 65, 0) 70%)'
      : 'radial-gradient(ellipse 70% 55% at 35% -5%, rgba(143, 27, 53, 0.09), rgba(143, 27, 53, 0) 70%)',
});

/** Space between the board and the name bars above and below it. */
const BOARD_COLUMN_GAP = 4;
/** How far the board sits below the top of its column (Maia's name bar). */
const BOARD_OFFSET = PLAYER_BAR_HEIGHT + BOARD_COLUMN_GAP;
/** Space above the program when it wraps below the board. */
const WRAPPED_GAP = 32;

// Board and program sit side by side when there's room and wrap into a column
// when there isn't, without measuring the window (which the server can't).
// Side by side, the program should start level with the board, BOARD_OFFSET
// below the column's top; wrapped, it should start WRAPPED_GAP below the
// column. The program's top margin is WRAPPED_GAP for the wrapped case, and
// the column is raised by the rest of BOARD_OFFSET (a negative margin, offset
// by the stage's padding) so the side-by-side case lines up too.
const styles = StyleSheet.create({
  fill: { flex: 1 },
  page: { paddingHorizontal: 20, paddingVertical: 20, gap: 20, alignItems: 'center' },
  header: { width: '100%', maxWidth: 1040 },
  stage: {
    width: '100%',
    maxWidth: 1040,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'flex-start',
    columnGap: 32,
    paddingTop: BOARD_OFFSET - WRAPPED_GAP,
  },
  boardColumn: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 320,
    maxWidth: 600,
    marginTop: WRAPPED_GAP - BOARD_OFFSET,
    gap: BOARD_COLUMN_GAP,
  },
  frame: {
    aspectRatio: 1,
    borderRadius: 10,
    borderWidth: 1,
    padding: 0,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 12,
  },
  boardClip: { flex: 1, borderRadius: 9, overflow: 'hidden' },
  program: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 300,
    maxWidth: 400,
    marginTop: WRAPPED_GAP,
    padding: 24,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
