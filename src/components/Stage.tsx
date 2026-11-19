import { Surface, useTheme } from "@reactive/silk-native";
import Head from "expo-router/head";
import type { ReactNode } from "react";
import {
  type DimensionValue,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Board, { type BoardProps } from "@/components/Board";
import { EvaluationBar } from "@/components/EvaluationBar";
import { HEADER_HEIGHT, Header } from "@/components/Header";
import { PLAYER_BAR_HEIGHT, PLAYER_DISC } from "@/components/PlayerBar";
import { spotlight } from "@/theme/theme";

interface StageProps {
  /** The browser tab's title. */
  readonly title: string;
  /** The board column (`BoardColumn`), or a stand-in the same size while it loads. */
  readonly board: ReactNode;
  /** The panel beside the board, or below it on a narrow screen. */
  readonly program: ReactNode;
  /** Extra tags for the page's head, like `<meta name="robots">`. */
  readonly head?: ReactNode;
}

/**
 * A page of the app: the header, then the board column and the panel beside
 * it on the stage background. Every screen that shows a board uses it, so
 * they line up the same way.
 */
export function Stage({ title, board, program, head }: StageProps) {
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
        {head}
      </Head>
      <SafeAreaView style={styles.fill}>
        <ScrollView contentContainerStyle={styles.page}>
          <View style={styles.header}>
            <Header />
          </View>
          <View style={styles.stage}>
            <View style={styles.boardColumn}>{board}</View>
            <View style={styles.program}>{program}</View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

interface BoardColumnProps {
  /** The name bar above the board: the opponent's `PlayerBar`. */
  readonly top: ReactNode;
  /** The name bar below the board: the player's. */
  readonly bottom: ReactNode;
  /** The moves up to the position the evaluation bar judges. */
  readonly evaluated: readonly string[];
  readonly board: Omit<BoardProps, "dom">;
}

/** The board in its frame, with the evaluation bar beside it and a name bar above and below. */
export function BoardColumn({
  top,
  bottom,
  evaluated,
  board,
}: BoardColumnProps) {
  return (
    <>
      {top}
      <View style={styles.boardRow}>
        <EvaluationBar
          line={evaluated}
          orientation={board.orientation}
          style={styles.evaluation}
        />
        <BoardFrame>
          <Board
            {...board}
            dom={{ style: styles.fill, scrollEnabled: false }}
          />
        </BoardFrame>
      </View>
      {bottom}
    </>
  );
}

/**
 * Where the board column stands while what it shows loads: the frame and the
 * space around it, so nothing moves when the board arrives.
 */
export function BoardColumnPlaceholder({
  children,
}: {
  readonly children?: ReactNode;
}) {
  return (
    <>
      <View style={styles.barSpace} />
      <View style={styles.boardRow}>
        <View style={styles.evaluation} />
        <BoardFrame>
          <View style={[styles.fill, styles.center]}>{children}</View>
        </BoardFrame>
      </View>
      <View style={styles.barSpace} />
    </>
  );
}

function BoardFrame({ children }: { readonly children: ReactNode }) {
  const { theme } = useTheme();
  return (
    <Surface
      elevation="overlay"
      radius="md"
      border="subtle"
      style={styles.frame}
    >
      <View
        style={[
          styles.fill,
          { borderRadius: theme.semantic.radius.md - 1, overflow: "hidden" },
        ]}
      >
        {children}
      </View>
    </Surface>
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
  process.env.EXPO_OS === "web"
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
  center: { alignItems: "center", justifyContent: "center" },
  page: { padding: PAGE_SPACE, gap: PAGE_SPACE, alignItems: "center" },
  header: { width: "100%", maxWidth: STAGE_MAX },
  stage: {
    width: "100%",
    maxWidth: STAGE_MAX,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
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
  barSpace: { height: PLAYER_BAR_HEIGHT },
  // The evaluation bar sits in the column of the players' discs, between
  // them, and the board lines up with the names beside the discs.
  boardRow: { flexDirection: "row", gap: PLAYER_DISC.gap },
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
