import { Surface, useTheme } from '@reactive/silk-native';
import Head from 'expo-router/head';
import type { ComponentProps, ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Board, { type BoardProps } from '@/components/Board';
import { EvaluationBar } from '@/components/EvaluationBar';
import { HEADER_HEIGHT, Header } from '@/components/Header';
import { PLAYER_DISC, PlayerBar } from '@/components/PlayerBar';
import { BOARD_COLUMN_BASIS, PAGE_SPACE, PROGRAM_BASIS, STAGE_GAP } from '@/components/sideBySide';
import { Transport } from '@/components/Transport';
import { useStepKeys } from '@/components/useStepKeys';
import { colorName, opposite } from '@/game/replay';
import type { Game } from '@/game/useGame';
import { NARROW_CSS_LOADS, narrowCalc, narrowLength, narrowPart } from '@/theme/narrow';
import { spotlight } from '@/theme/theme';

interface StageProps {
  /** The browser tab's title. */
  readonly title: string;
  /** Where the page is, such as the lesson's line: the header names it on a narrow web page. */
  readonly place?: string;
  /** The board column (`BoardColumn`), or a stand-in the same size while it loads. */
  readonly board: ReactNode;
  /** The panel beside the board, or below it on a narrow screen. */
  readonly program: ReactNode;
}

/**
 * A page of the app: the header, then the board column and the panel beside
 * it on the stage background. Every screen that shows a board uses it, so
 * they line up the same way. On a narrow web page the panel goes below
 * the board and scrolls on its own, so the board stays in view (narrow.css).
 */
export function Stage({ title, place, board, program }: StageProps) {
  const { theme } = useTheme();
  return (
    <View
      style={[
        styles.fill,
        {
          backgroundColor: theme.semantic.color.surface,
          backgroundImage: spotlight[theme.colorScheme],
        },
      ]}
    >
      <Head>
        <title>{title}</title>
      </Head>
      <SafeAreaView style={styles.fill}>
        <ScrollView>
          <View {...narrowPart('page')} style={styles.page}>
            <View style={styles.header}>
              <Header place={place} />
            </View>
            <View {...narrowPart('stage')} style={styles.stage}>
              <View {...narrowPart('board-column')} style={styles.boardColumn}>
                {board}
              </View>
              <View {...narrowPart('program')} style={styles.program}>
                {program}
              </View>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

interface BoardColumnProps {
  /** The game on the board. */
  readonly game: Game;
  /** The opponent's name bar: who plays the other side and how, and any small control at its end. */
  readonly rival: Pick<ComponentProps<typeof PlayerBar>, 'name' | 'detail' | 'brief' | 'children'>;
  /** The board, with the player's side (`orientation`) at the bottom. */
  readonly board: Omit<BoardProps, 'dom'>;
}

/**
 * The board in its frame, with the evaluation bar beside it, the opponent's
 * name bar above it and the player's below, holding the move stepper. The
 * arrow keys step through the moves too.
 */
export function BoardColumn({ game, rival, board }: BoardColumnProps) {
  const { moves, ply, goto } = game;
  const side = board.orientation;
  const other = opposite(side);
  useStepKeys(ply, moves.length, goto);
  return (
    <>
      <PlayerBar
        {...rival}
        style={styles.namesBar}
        color={other}
        toMove={game.toMove === other}
        thinking={game.thinking}
        material={game.material[other]}
      />
      <View style={styles.boardRow}>
        <EvaluationBar line={moves.slice(0, ply)} orientation={side} style={styles.evaluation} />
        <BoardFrame>
          <Board {...board} dom={{ style: styles.fill, scrollEnabled: false }} />
        </BoardFrame>
      </View>
      <PlayerBar
        name="You"
        detail={colorName(side)}
        style={styles.controlsBar}
        color={side}
        toMove={game.toMove === side}
        material={game.material[side]}
      >
        <Transport ply={ply} total={moves.length} onGoto={goto} />
      </PlayerBar>
    </>
  );
}

/**
 * Where the board column stands while what it shows loads: the frame and the
 * space around it, so nothing moves when the board arrives.
 */
export function BoardColumnPlaceholder({ children }: { readonly children?: ReactNode }) {
  return (
    <>
      <View style={styles.namesBar} />
      <View style={styles.boardRow}>
        <View style={styles.evaluation} />
        <BoardFrame>
          <View style={[styles.fill, styles.center]}>{children}</View>
        </BoardFrame>
      </View>
      <View style={styles.controlsBar} />
    </>
  );
}

function BoardFrame({ children }: { readonly children: ReactNode }) {
  const { theme } = useTheme();
  return (
    <Surface elevation="overlay" radius="md" border="subtle" style={styles.frame}>
      <View
        style={[styles.fill, { borderRadius: theme.semantic.radius.md - 1, overflow: 'hidden' }]}
      >
        {children}
      </View>
    </Surface>
  );
}

/**
 * The name bars' heights, fixed so the panel lines up with the board: the
 * player's, with the move stepper, and the opponent's, with only its names
 * and at most a small switch. Shorter on a narrow web page, where the names
 * share one line.
 */
const PLAYER_BAR_HEIGHT = {
  controls: narrowLength('controls-bar-height', 60),
  names: narrowLength('names-bar-height', 60),
} as const;
/** Space between the board and the name bars above and below it. */
const BOARD_COLUMN_GAP = 4;
/** The evaluation bar's width: a thin strip on a narrow web page. */
const EVALUATION_BAR_WIDTH = narrowLength('evaluation-width', 22);
/** How far the board sits below the top of its column (the opponent's name bar). */
const BOARD_OFFSET = PLAYER_BAR_HEIGHT.names.plus(BOARD_COLUMN_GAP);
/** How far the board sits above the bottom of its column (the player's bar, with the stepper). */
const BOARD_UNDER = PLAYER_BAR_HEIGHT.controls.plus(BOARD_COLUMN_GAP);
/** The board's largest size. */
const BOARD_MAX = 720;
/** The width the column adds beside the board: the players' discs and their gap. */
const BESIDE_BOARD = PLAYER_DISC.size.plus(PLAYER_DISC.gap);
/** The board column's largest width. */
const BOARD_COLUMN_MAX = BOARD_MAX + BESIDE_BOARD.wide;
/** The program's largest width. */
const PROGRAM_MAX = 400;
/** Wide enough for the board and the program at their largest. */
const STAGE_MAX = BOARD_COLUMN_MAX + STAGE_GAP + PROGRAM_MAX;
/**
 * Height around the board: the page's top and bottom padding and the gap
 * below the header (3 × PAGE_SPACE), the header, and both name bars.
 */
const AROUND_BOARD = PAGE_SPACE.times(3).plus(HEADER_HEIGHT).plus(BOARD_OFFSET).plus(BOARD_UNDER);
/** On the web, the smallest the board shrinks to in a short window. */
const BOARD_MIN_WEB = narrowLength('board-min', 320);
/** Height kept below the board column for the panel: none beside it, some below it on a narrow page. */
const PANEL_RESERVE = narrowLength('panel-reserve', 0);
/**
 * The board column's width limit. On the web the board also shrinks to fit
 * the window's height, so the player's name bar and the move buttons stay in
 * view, and on a narrow page the start of the panel too. CSS does it, since
 * the server can't measure the window. Native has no window to fit, so its limit
 * is the largest board column, BOARD_COLUMN_MAX. `clamp()` has no NarrowLength form,
 * so the web's clamp and that native number are written apart.
 */
const BOARD_COLUMN_LIMIT = narrowCalc(
  `clamp(${BOARD_MIN_WEB.css}, 100svh - ${AROUND_BOARD.plus(PANEL_RESERVE).css}, ${BOARD_MAX}px) + ${BESIDE_BOARD.css}`,
  BOARD_COLUMN_MAX,
);
/** Space above the program when it wraps below the board. */
const WRAPPED_GAP = narrowLength('wrapped-gap', 32);
/** How far the column is raised so the program lines up beside it (see below). */
const COLUMN_RAISE = BOARD_OFFSET.minus(WRAPPED_GAP);

// Board and program sit side by side when there's room and wrap into a column
// when there isn't, without measuring the window (which the server can't).
// On the web they never wrap: narrow.css stacks them below the width they need
// side by side (SIDE_BY_SIDE_MIN), so a stacked page always gets the narrow
// layout. Just above it, a page scrollbar can take some of that width; the two
// then shrink a little below their flex bases rather than stack without it.
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
  center: { alignItems: 'center', justifyContent: 'center' },
  page: { padding: PAGE_SPACE.value, gap: PAGE_SPACE.value, alignItems: 'center' },
  header: { width: '100%', maxWidth: STAGE_MAX },
  stage: {
    width: '100%',
    maxWidth: STAGE_MAX,
    flexDirection: 'row',
    flexWrap: NARROW_CSS_LOADS ? 'nowrap' : 'wrap',
    justifyContent: 'center',
    columnGap: STAGE_GAP,
    paddingTop: COLUMN_RAISE.value,
  },
  boardColumn: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: BOARD_COLUMN_BASIS,
    maxWidth: BOARD_COLUMN_LIMIT,
    marginTop: COLUMN_RAISE.times(-1).value,
    gap: BOARD_COLUMN_GAP,
  },
  namesBar: { height: PLAYER_BAR_HEIGHT.names.value },
  controlsBar: { height: PLAYER_BAR_HEIGHT.controls.value },
  // The evaluation bar sits in the column of the players' discs, between
  // them, and the board lines up with the names beside the discs.
  boardRow: { flexDirection: 'row', gap: PLAYER_DISC.gap.value },
  // Narrower than the discs, and centered under them.
  evaluation: {
    width: EVALUATION_BAR_WIDTH.value,
    marginHorizontal: PLAYER_DISC.size.minus(EVALUATION_BAR_WIDTH).times(0.5).value,
  },
  frame: { flex: 1, aspectRatio: 1 },
  program: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: PROGRAM_BASIS,
    maxWidth: PROGRAM_MAX,
    marginTop: WRAPPED_GAP.value,
  },
});
