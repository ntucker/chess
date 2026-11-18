import Ionicons from '@expo/vector-icons/Ionicons';
import { Button, Inline, Separator, Stack, Surface, Text, useTheme } from '@reactive/silk-native';
import Head from 'expo-router/head';
import { useEffect, useEffectEvent, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Board from '@/components/Board';
import { EvaluationBar } from '@/components/EvaluationBar';
import { Eyebrow } from '@/components/Eyebrow';
import { GameStatus } from '@/components/GameStatus';
import { Header } from '@/components/Header';
import { PillChoice } from '@/components/PillChoice';
import { PLAYER_BAR_HEIGHT, PLAYER_DISC, PlayerBar } from '@/components/PlayerBar';
import { Scoresheet } from '@/components/Scoresheet';
import { SideChooser } from '@/components/SideChooser';
import { Transport } from '@/components/Transport';
import { EVALUATION_ENGINES, type EvaluationEngine } from '@/evaluation/evaluation';
import { setEvaluationEngine, useEvaluationEngine } from '@/evaluation/useEvaluationEngine';
import { type Color, colorName, opposite } from '@/game/replay';
import { useGame } from '@/game/useGame';
import { JUDGE_RATING } from '@/maia/maia';
import type { MaiaRating } from '@/maia/models';
import { spotlight } from '@/theme/theme';

/** Maia's strength for now; picking it comes with the opening lessons. */
const RATING: MaiaRating = 1500;

const ENGINE_CHOICES: Record<EvaluationEngine, { label: string; note: string }> = {
  stockfish: {
    label: 'Stockfish',
    note: 'How the position stands, judged by the Stockfish chess engine.',
  },
  maia: {
    label: 'Maia',
    note: `How players rated about ${JUDGE_RATING} tend to score from here. Uses less memory.`,
  },
};

const ENGINE_OPTIONS = EVALUATION_ENGINES.map((value) => ({
  value,
  label: ENGINE_CHOICES[value].label,
}));

export default function PlayScreen() {
  const game = useGame(RATING);
  const { playerColor, line, ply, current, toMove, thinking, goto } = game;
  const [nextColor, setNextColor] = useState<Color>(playerColor);
  const { theme } = useTheme();
  const { color, radius } = theme.semantic;
  const maiaColor = opposite(playerColor);
  const engine = useEvaluationEngine();

  const chooseSide = (side: Color) => {
    setNextColor(side);
    // Nothing to lose yet, so switch sides right away.
    if (!game.started && side !== playerColor) game.newGame(side);
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

  return (
    <View
      style={[
        styles.fill,
        { backgroundColor: color.surface, backgroundImage: spotlight[theme.colorScheme] },
      ]}
    >
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
              <PlayerBar
                name="Maia"
                detail={`Plays like a ${RATING} · ${colorName(maiaColor)}`}
                color={maiaColor}
                toMove={toMove === maiaColor}
                thinking={thinking}
                material={game.material[maiaColor]}
              />
              <View style={styles.boardRow}>
                <EvaluationBar
                  line={line.slice(0, ply)}
                  orientation={playerColor}
                  style={styles.evaluation}
                />
                <Surface elevation="overlay" radius="md" border="subtle" style={styles.frame}>
                  <View style={[styles.fill, { borderRadius: radius.md - 1, overflow: 'hidden' }]}>
                    <Board
                      fen={current.fen}
                      orientation={playerColor}
                      turnColor={current.turn}
                      movableColor={game.canMove ? playerColor : undefined}
                      dests={current.dests}
                      lastMove={current.move ? [current.move.from, current.move.to] : undefined}
                      check={current.check}
                      onMove={game.move}
                      dom={{ style: styles.fill, scrollEnabled: false }}
                    />
                  </View>
                </Surface>
              </View>
              <PlayerBar
                name="You"
                detail={colorName(playerColor)}
                color={playerColor}
                toMove={toMove === playerColor}
                material={game.material[playerColor]}
              >
                <Transport ply={ply} total={line.length} onGoto={goto} />
              </PlayerBar>
            </View>

            <View style={styles.program}>
              <Stack gap="5">
                <GameStatus
                  playerColor={playerColor}
                  latest={game.latest}
                  viewing={game.atLatest ? undefined : ply}
                  total={line.length}
                  rating={RATING}
                  thinking={thinking}
                  error={game.error}
                  onRetry={game.retry}
                />
                <Separator />
                <Stack gap="3">
                  <Eyebrow>Play as</Eyebrow>
                  <Inline gap="3" align="center" wrap="nowrap">
                    <View style={styles.fill}>
                      <SideChooser value={nextColor} onChange={chooseSide} />
                    </View>
                    <Button onPress={() => game.newGame(nextColor)}>
                      <Ionicons name="refresh" size={15} /> New game
                    </Button>
                  </Inline>
                </Stack>
                <Separator />
                <Stack gap="3">
                  <Eyebrow>Evaluation bar</Eyebrow>
                  <PillChoice
                    label="Evaluation bar"
                    options={ENGINE_OPTIONS}
                    value={engine}
                    onChange={setEvaluationEngine}
                  />
                  <Text role="caption" tone="secondary">
                    {ENGINE_CHOICES[engine].note}
                  </Text>
                </Stack>
                <Separator />
                <Stack gap="3">
                  <Eyebrow>Scoresheet</Eyebrow>
                  <Scoresheet plies={game.plies} ply={ply} onGoto={goto} />
                </Stack>
              </Stack>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

/** Space between the board and the name bars above and below it. */
const BOARD_COLUMN_GAP = 4;
/** The evaluation bar's width. */
const EVALUATION_BAR_WIDTH = 22;
/** The board's largest size. */
const BOARD_MAX = 600;
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
//
// The stage stretches its children rather than aligning them to the start of
// their line: in a wrapping row, Yoga (React Native's layout engine) drops a
// child's top margin when aligned to the start, so on Android the program
// would ride up over the player's name bar. Stretching only adds empty space
// below the shorter of the two.
const styles = StyleSheet.create({
  fill: { flex: 1 },
  page: { padding: 20, gap: 20, alignItems: 'center' },
  header: { width: '100%', maxWidth: 1040 },
  stage: {
    width: '100%',
    maxWidth: 1040,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    columnGap: 48,
    paddingTop: BOARD_OFFSET - WRAPPED_GAP,
  },
  boardColumn: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 320,
    maxWidth: BOARD_MAX + PLAYER_DISC.size + PLAYER_DISC.gap,
    marginTop: WRAPPED_GAP - BOARD_OFFSET,
    gap: BOARD_COLUMN_GAP,
  },
  // The evaluation bar sits in the column of the players' discs, between
  // them, and the board lines up with the names beside the discs.
  boardRow: { flexDirection: 'row', gap: PLAYER_DISC.gap },
  // Narrower than the discs, and centered under them.
  evaluation: {
    width: EVALUATION_BAR_WIDTH,
    marginHorizontal: (PLAYER_DISC.size - EVALUATION_BAR_WIDTH) / 2,
  },
  frame: { flex: 1, aspectRatio: 1 },
  program: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 300,
    maxWidth: 360,
    marginTop: WRAPPED_GAP,
  },
});
