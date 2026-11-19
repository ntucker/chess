import { useController } from '@data-client/react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button, Inline, Separator, Stack, Surface, useTheme } from '@reactive/silk-native';
import Head from 'expo-router/head';
import { useEffect, useEffectEvent, useState } from 'react';
import { type DimensionValue, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Board from '@/components/Board';
import { EvaluationBar } from '@/components/EvaluationBar';
import { EvaluationEngineChoice } from '@/components/EvaluationEngineChoice';
import { Eyebrow } from '@/components/Eyebrow';
import { GameStatus } from '@/components/GameStatus';
import { HEADER_HEIGHT, Header } from '@/components/Header';
import { OpponentChoice } from '@/components/OpponentChoice';
import { PLAYER_BAR_HEIGHT, PLAYER_DISC, PlayerBar } from '@/components/PlayerBar';
import { Scoresheet } from '@/components/Scoresheet';
import { SideChooser } from '@/components/SideChooser';
import { Transport } from '@/components/Transport';
import { type Color, colorName, opposite } from '@/game/replay';
import { useGame } from '@/game/useGame';
import { describeOpponent } from '@/opponent/opponent';
import { gameOpponent } from '@/resources/opponent';
import { useSettings } from '@/settings/SettingsProvider';
import { spotlight } from '@/theme/theme';

export default function PlayScreen() {
  const ctrl = useController();
  const { opponent } = useSettings();
  const described = describeOpponent(opponent);
  const game = useGame(gameOpponent(ctrl, opponent));
  const { playerColor, line, qualities, ply, current, toMove, thinking, goto } = game;
  const [nextColor, setNextColor] = useState<Color>(playerColor);
  const { theme } = useTheme();
  const { color, radius } = theme.semantic;
  const opponentColor = opposite(playerColor);

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
                name={described.name}
                detail={`${described.tagline} · ${colorName(opponentColor)}`}
                color={opponentColor}
                toMove={toMove === opponentColor}
                thinking={thinking}
                material={game.material[opponentColor]}
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
                      lastMoveQuality={qualities[ply - 1]}
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
                  opponent={opponent}
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
                  <Eyebrow>Scoresheet</Eyebrow>
                  <Scoresheet plies={game.plies} qualities={qualities} ply={ply} onGoto={goto} />
                </Stack>
                <Stack gap="1">
                  <OpponentChoice opponent={opponent} />
                  <EvaluationEngineChoice />
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
/** How far the board sits below the top of its column (the opponent's name bar). */
const BOARD_OFFSET = PLAYER_BAR_HEIGHT + BOARD_COLUMN_GAP;
/** The board's largest size. */
const BOARD_MAX = 720;
/** The width the column adds beside the board: the players' discs and their gap. */
const BESIDE_BOARD = PLAYER_DISC.size + PLAYER_DISC.gap;
/** The board column's largest width. */
const BOARD_COLUMN_MAX = BOARD_MAX + BESIDE_BOARD;
/** The program's largest width. */
const PROGRAM_MAX = 400;
/** Space between the board column and the program. */
const STAGE_GAP = 48;
/** Wide enough for the board and the program at their largest. */
const STAGE_MAX = BOARD_COLUMN_MAX + STAGE_GAP + PROGRAM_MAX;
/** The page's padding, and the space between the header and the stage. */
const PAGE_SPACE = 20;
/**
 * Height around the board: the page's top and bottom padding and the gap
 * below the header (3 × PAGE_SPACE), the header, and both name bars.
 */
const AROUND_BOARD = 3 * PAGE_SPACE + HEADER_HEIGHT + 2 * BOARD_OFFSET;
/** On the web, the smallest the board shrinks to in a short window. */
const BOARD_MIN_WEB = 320;
/**
 * The board column's width limit. On the web the board also shrinks to fit
 * the window's height, so the player's name bar and the move buttons stay in
 * view. CSS does it, since the server can't measure the window; React
 * Native's types don't know CSS functions, hence the cast.
 */
const BOARD_COLUMN_LIMIT =
  process.env.EXPO_OS === 'web'
    ? (`calc(clamp(${BOARD_MIN_WEB}px, 100svh - ${AROUND_BOARD}px, ${BOARD_MAX}px) + ${BESIDE_BOARD}px)` as DimensionValue)
    : BOARD_COLUMN_MAX;
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
  page: { padding: PAGE_SPACE, gap: PAGE_SPACE, alignItems: 'center' },
  header: { width: '100%', maxWidth: STAGE_MAX },
  stage: {
    width: '100%',
    maxWidth: STAGE_MAX,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    columnGap: STAGE_GAP,
    paddingTop: BOARD_OFFSET - WRAPPED_GAP,
  },
  boardColumn: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 320,
    maxWidth: BOARD_COLUMN_LIMIT,
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
    maxWidth: PROGRAM_MAX,
    marginTop: WRAPPED_GAP,
  },
});
