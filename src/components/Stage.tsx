import { Surface, useTheme } from '@reactive/silk-native';
import type { ComponentProps, ReactNode } from 'react';
import { View } from 'react-native';

import { gameEnding } from '@/board/ending';
import Board, { type BoardProps } from '@/components/Board';
import { EndingCard } from '@/components/EndingCard';
import { EvaluationBar } from '@/components/EvaluationBar';
import type { HeaderProps } from '@/components/Header';
import { Page } from '@/components/Page';
import { PlayerBar } from '@/components/PlayerBar';
import {
  BOARD_COLUMN_BASIS,
  BOARD_COLUMN_GAP,
  BOARD_COLUMN_LIMIT_CSS,
  BOARD_COLUMN_MAX,
  BOARD_OFFSET,
  boardColumnLimit,
  PLAYER_BAR_HEIGHT,
  PLAYER_DISC,
  PROGRAM_BASIS,
  STAGE_GAP,
} from '@/theme/sideBySide';
import { Transport } from '@/components/Transport';
import { useStepKeys } from '@/components/useStepKeys';
import { colorName, opposite } from '@/game/replay';
import type { Game } from '@/game/useGame';
import { narrowLength, narrowStyles } from '@/theme/narrow';
import { NarrowScroll, useNarrowPart, useNarrowStyles, useNarrowViewport } from '@/theme/Narrow';

interface StageProps {
  /** The browser tab's title; none leaves it as it is. */
  readonly title?: string;
  /** What the header shows of where the page is (see `Header`). */
  readonly header?: HeaderProps;
  /** The board column (`BoardColumn`), or a stand-in the same size while it loads. */
  readonly board: ReactNode;
  /** The panel beside the board, or below it on a narrow screen. */
  readonly program: ReactNode;
}

/**
 * A page with a board: the board column and the panel beside it, under the
 * header. Every screen that shows a board uses it, so they line up the same
 * way. On a narrow page the panel goes below the board and scrolls on its
 * own, so the board stays in view.
 */
export function Stage({ title, header, board, program }: StageProps) {
  const styles = useNarrowStyles(STYLES);
  const part = useNarrowPart();
  const fit = useBoardFit();
  return (
    <Page title={title} header={header} maxWidth={STAGE_MAX} fillsWindow>
      <View {...part('stage', styles.stage)}>
        <View {...part('board-column', [styles.boardColumn, fit])}>{board}</View>
        <NarrowScroll part="program" style={styles.program}>
          {program}
        </NarrowScroll>
      </View>
    </Page>
  );
}

interface BoardColumnProps {
  /** The game on the board. */
  readonly game: Game;
  /** The opponent's name bar: who plays the other side and how, and any small control at its end. */
  readonly rival: Pick<
    ComponentProps<typeof PlayerBar>,
    'name' | 'detail' | 'brief' | 'detailControl' | 'children'
  >;
  /** The board, with the player's side (`orientation`) at the bottom. */
  readonly board: Omit<BoardProps, 'dom' | 'ending'>;
  /** Swaps the sides: given, either name bar's disc is a button that does it. */
  readonly onSwap?: () => void;
  /** The move stepper's middle on a narrow page (`Transport`). */
  readonly stepperMiddle?: ReactNode;
}

/**
 * The board in its frame, with the evaluation bar beside it, the opponent's
 * name bar above it and the player's below, holding the move stepper. The
 * arrow keys step through the moves too.
 */
export function BoardColumn({ game, rival, board, onSwap, stepperMiddle }: BoardColumnProps) {
  const { moves, ply, goto } = game;
  const side = board.orientation;
  const other = opposite(side);
  useStepKeys(ply, moves.length, goto);
  const swap = onSwap && { label: `Play as ${colorName(other)}`, onPress: onSwap };
  const styles = useNarrowStyles(STYLES);
  // Only the game's last position has a result, so stepping back from it puts the ending away.
  const ending = gameEnding(game.current.result, side);
  return (
    <>
      <PlayerBar
        {...rival}
        style={styles.namesBar}
        color={other}
        toMove={game.toMove === other}
        thinking={game.thinking}
        material={game.material[other]}
        swap={swap}
      />
      <View style={styles.boardRow}>
        <EvaluationBar line={moves.slice(0, ply)} orientation={side} style={styles.evaluation} />
        <BoardFrame>
          <Board {...board} ending={ending} dom={{ style: styles.fill, scrollEnabled: false }} />
          {ending ? (
            <EndingCard ending={ending} rival={rival.name} fen={board.fen} orientation={side} />
          ) : null}
        </BoardFrame>
      </View>
      <PlayerBar
        name="You"
        detail={colorName(side)}
        style={styles.controlsBar}
        color={side}
        toMove={game.toMove === side}
        material={game.material[side]}
        swap={swap}
      >
        <Transport ply={ply} total={moves.length} onGoto={goto} middle={stepperMiddle} />
      </PlayerBar>
    </>
  );
}

/**
 * Where the board column stands while what it shows loads: the frame and the
 * space around it, so nothing moves when the board arrives.
 */
export function BoardColumnPlaceholder({ children }: { readonly children?: ReactNode }) {
  const styles = useNarrowStyles(STYLES);
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
  const styles = useNarrowStyles(STYLES);
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

/** The evaluation bar's width: a thin strip on a narrow page. */
const EVALUATION_BAR_WIDTH = narrowLength('evaluation-width', 22);
/** The program's largest width. */
const PROGRAM_MAX = 400;
/** Wide enough for the board and the program at their largest: the header's width on every page. */
export const STAGE_MAX = BOARD_COLUMN_MAX + STAGE_GAP + PROGRAM_MAX;
/** The board column's width limit off the web, from the window's height; on the web, none to add. */
function useBoardFit() {
  const viewport = useNarrowViewport();
  return viewport && { maxWidth: boardColumnLimit(viewport.height, viewport.px) };
}
/** Space above the program when it sits below the board. */
const WRAPPED_GAP = narrowLength('wrapped-gap', 32);
/** How far the column is raised so the program lines up beside it (see below). */
const COLUMN_RAISE = BOARD_OFFSET.minus(WRAPPED_GAP);

// Board and program sit side by side, and a narrow page stacks them, below
// the width they need side by side (SIDE_BY_SIDE_MIN): narrow.css on the web,
// the parts' native styles elsewhere. Just above it, a page scrollbar can take
// some of that width; the two then shrink a little below their flex bases.
// Side by side, the program should start level with the board, BOARD_OFFSET
// below the column's top; stacked, it should start WRAPPED_GAP below the
// column. The program's top margin is WRAPPED_GAP for the stacked case, and
// the column is raised by the rest of BOARD_OFFSET (a negative margin, offset
// by the stage's padding) so the side-by-side case lines up too.
const STYLES = narrowStyles((px) => ({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  stage: {
    width: '100%',
    maxWidth: STAGE_MAX,
    flexDirection: 'row',
    justifyContent: 'center',
    columnGap: STAGE_GAP,
    paddingTop: px(COLUMN_RAISE),
  },
  boardColumn: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: BOARD_COLUMN_BASIS,
    maxWidth: BOARD_COLUMN_LIMIT_CSS,
    marginTop: px(COLUMN_RAISE.times(-1)),
    gap: BOARD_COLUMN_GAP,
  },
  namesBar: { height: px(PLAYER_BAR_HEIGHT.names) },
  controlsBar: { height: px(PLAYER_BAR_HEIGHT.controls) },
  // The evaluation bar sits in the column of the players' discs, between
  // them, and the board lines up with the names beside the discs.
  boardRow: { flexDirection: 'row', gap: px(PLAYER_DISC.gap) },
  // Narrower than the discs, and centered under them.
  evaluation: {
    width: px(EVALUATION_BAR_WIDTH),
    marginHorizontal: px(PLAYER_DISC.size.minus(EVALUATION_BAR_WIDTH).times(0.5)),
  },
  frame: { flex: 1, aspectRatio: 1 },
  program: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: PROGRAM_BASIS,
    maxWidth: PROGRAM_MAX,
    marginTop: px(WRAPPED_GAP),
  },
}));
