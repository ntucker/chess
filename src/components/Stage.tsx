import { Surface, useFlickGesture, useTheme } from '@reactive/silk-native';
import { type ComponentProps, type ReactNode, useState } from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';

import { asideAfter, type CardAside } from '@/board/cardAside';
import { gameEnding } from '@/game/ending';
import Board, { type BoardProps } from '@/components/Board';
import { EndingCard } from '@/components/EndingCard';
import { EvaluationBar } from '@/components/EvaluationBar';
import { tickMove } from '@/components/haptics';
import type { HeaderProps } from '@/components/Header';
import { Page } from '@/components/Page';
import { PlayerBar } from '@/components/PlayerBar';
import {
  BOARD_COLUMN_GAP,
  BOARD_COLUMN_MAX,
  BOARD_COLUMN_WIDTH,
  BOARD_OFFSET,
  boardColumnLimit,
  boardColumnLimitCss,
  PLAYER_BAR_HEIGHT,
  PLAYER_DISC,
  PROGRAM_FOOT,
  PROGRAM_WIDTH,
  STAGE_GAP,
  WRAPPED_GAP,
} from '@/theme/sideBySide';
import { Transport } from '@/components/Transport';
import { useStepKeys } from '@/components/useStepKeys';
import type { EvaluationEngine } from '@/evaluation/evaluation';
import { colorName, opposite } from '@/game/replay';
import type { Game } from '@/game/useGame';
import { narrowLength, narrowStyles } from '@/theme/narrow';
import {
  NarrowOnly,
  NarrowScroll,
  useNarrowPart,
  useNarrowStyles,
  useNarrowViewport,
} from '@/theme/Narrow';

interface StageProps {
  /** The browser tab's title; none leaves it as it is. */
  readonly title?: string;
  /** What the header shows of where the page is (see `Header`). */
  readonly header?: HeaderProps;
  /** The board column (`BoardColumn`), or a stand-in the same size while it loads. */
  readonly board: ReactNode;
  /** The panel beside the board, or below it on a narrow screen. */
  readonly program: ReactNode;
  /** Small print across the foot of a wide page, under the board and the panel (`Page`). */
  readonly footer?: ReactNode;
  /** On a narrow page, controls fixed under the panel at the screen's foot, such as the review's actions. */
  readonly programFoot?: ReactNode;
}

/**
 * A page with a board: the board column and the panel beside it, under the
 * header. Every screen that shows a board uses it, so they line up the same
 * way. On a narrow page the panel goes below the board and scrolls on its
 * own, so the board stays in view.
 */
export function Stage({ title, header, board, program, footer, programFoot }: StageProps) {
  const styles = useNarrowStyles(STYLES);
  const part = useNarrowPart();
  const foot = Boolean(programFoot);
  const fit = useBoardFit(foot);
  return (
    <Page title={title} header={header} maxWidth={STAGE_MAX} fillsWindow footer={footer}>
      <View {...part('stage', styles.stage)}>
        <View
          {...part('board-column', [
            styles.boardColumn,
            foot ? styles.footLimit : styles.limit,
            fit,
          ])}
        >
          {board}
        </View>
        <NarrowScroll part={foot ? 'footed-program' : 'program'} style={styles.program}>
          {program}
        </NarrowScroll>
        {programFoot ? <NarrowOnly style={styles.programFoot}>{programFoot}</NarrowOnly> : null}
      </View>
    </Page>
  );
}

/** What the board column shows of a game: its moves, the one on the board, and whose turn it is. */
export type BoardGame = Pick<
  Game,
  'moves' | 'ply' | 'goto' | 'current' | 'toMove' | 'thinking' | 'captures'
>;

interface BoardColumnProps {
  /** The game on the board. */
  readonly game: BoardGame;
  /** The opponent's name bar: who plays the other side and how, and any small control at its end. */
  readonly rival: Pick<
    ComponentProps<typeof PlayerBar>,
    'name' | 'detail' | 'detailWideOnly' | 'detailControl' | 'children'
  >;
  /** The player's name bar: anything to show before the move stepper at its end. */
  readonly player?: Pick<ComponentProps<typeof PlayerBar>, 'children'>;
  /** A finger thrown up from the player's bar: a phone's way to open its settings. */
  readonly onFlickUp?: () => void;
  /** The board, with the player's side (`orientation`) at the bottom. */
  readonly board: Omit<BoardProps, 'dom' | 'ending' | 'onEndingPointer'>;
  /** Swaps the sides: given, either name bar's disc is a button that does it. */
  readonly onSwap?: () => void;
  /** The move stepper's middle on a narrow page (`Transport`). */
  readonly stepperMiddle?: ReactNode;
  /** The evaluation bar shows only this engine's analyses in the store (`EvaluationBar`'s `reads`). */
  readonly evaluationReads?: EvaluationEngine;
  /** The moves to the position the evaluation bar reads, when the board shows another than the game's at `ply`. */
  readonly evaluationLine?: readonly string[];
  /**
   * On a narrow page, what stands in for the name bars above and below the
   * board, in their heights: the review's one bar of both players, and its
   * stepper.
   */
  readonly narrowBars?: { readonly names: ReactNode; readonly controls: ReactNode };
}

/**
 * The board in its frame, with the evaluation bar beside it, the opponent's
 * name bar above it and the player's below, holding the move stepper. The
 * arrow keys step through the moves too. On Android, each move the learner
 * plays ticks (`tickMove`).
 */
export function BoardColumn({
  game,
  rival,
  player,
  board,
  onSwap,
  stepperMiddle,
  onFlickUp,
  evaluationReads,
  evaluationLine,
  narrowBars,
}: BoardColumnProps) {
  const { moves, ply, goto } = game;
  const side = board.orientation;
  const other = opposite(side);
  useStepKeys(ply, moves.length, goto);
  const swap = onSwap && { label: `Play as ${colorName(other)}`, onPress: onSwap };
  const styles = useNarrowStyles(STYLES);
  const part = useNarrowPart();
  const playerBar = (
    <PlayerBar
      name="You"
      detail={colorName(side)}
      style={styles.controlsBar}
      color={side}
      toMove={game.toMove === side}
      captures={game.captures}
      swap={swap}
    >
      {player?.children}
      <Transport ply={ply} total={moves.length} onGoto={goto} middle={stepperMiddle} />
    </PlayerBar>
  );
  /** A name bar, or with `narrowBars` the bar on a wide page and its stand-in on a narrow one. */
  const bar = (wide: ReactNode, narrow: ReactNode, style: StyleProp<ViewStyle>) =>
    narrowBars ? (
      <>
        <View {...part('wide-only')}>{wide}</View>
        <NarrowOnly style={style}>{narrow}</NarrowOnly>
      </>
    ) : (
      wide
    );
  // Only the game's last position has a result, so stepping back from it puts
  // the ending away; so does a lesson's idea playing back over it on the board.
  const ending = board.fen === game.current.fen ? gameEnding(game.current, side) : undefined;
  // The ending card stays up while the final position is shown, so the
  // learner can put it aside to see the board (`asideAfter`). Leaving that
  // position brings the card back for its next showing.
  const endingFen = ending && board.fen;
  const [aside, setAside] = useState<CardAside>();
  if (aside && aside.at !== endingFen) setAside(undefined);
  return (
    <>
      {bar(
        <PlayerBar
          {...rival}
          style={styles.namesBar}
          color={other}
          toMove={game.toMove === other}
          thinking={game.thinking}
          captures={game.captures}
          swap={swap}
        />,
        narrowBars?.names,
        styles.namesBar,
      )}
      <View style={styles.boardRow}>
        <EvaluationBar
          line={evaluationLine ?? moves.slice(0, ply)}
          orientation={side}
          reads={evaluationReads}
          style={styles.evaluation}
        />
        <BoardFrame>
          <Board
            {...board}
            onMove={(from, to) => {
              tickMove();
              board.onMove(from, to);
            }}
            ending={ending}
            onEndingPointer={(pointer) => {
              if (endingFen) setAside((current) => asideAfter(current, pointer, endingFen));
            }}
            dom={{ style: styles.fill, scrollEnabled: false }}
          />
          {ending ? (
            <EndingCard
              ending={ending}
              rival={rival.name}
              orientation={side}
              aside={aside !== undefined}
            />
          ) : null}
        </BoardFrame>
      </View>
      {bar(
        onFlickUp ? <FlickUp onFlick={onFlickUp}>{playerBar}</FlickUp> : playerBar,
        narrowBars?.controls,
        styles.controlsBar,
      )}
    </>
  );
}

/** `children`, with a finger thrown up from them calling `onFlick` (silk's `useFlickGesture`). */
function FlickUp({
  onFlick,
  children,
}: {
  readonly onFlick: () => void;
  readonly children: ReactNode;
}) {
  const flick = useFlickGesture({ direction: 'up', onFlick });
  return (
    <GestureDetector {...flick}>
      <View>{children}</View>
    </GestureDetector>
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
function useBoardFit(foot: boolean) {
  const viewport = useNarrowViewport();
  return viewport && { maxWidth: boardColumnLimit(viewport.height, viewport.px, foot) };
}
/** How far the column is raised so the program lines up beside it (see below). */
const COLUMN_RAISE = BOARD_OFFSET.minus(WRAPPED_GAP);

// Board and program sit side by side, and a narrow page stacks them, below
// the width they need side by side (SIDE_BY_SIDE_MIN): narrow.css on the web,
// the parts' native styles elsewhere. Just above it, a page scrollbar can take
// some of that width; the two then shrink a little below their widths.
// Side by side, the program should start level with the board, BOARD_OFFSET
// below the column's top; stacked, it should start WRAPPED_GAP below the
// column. The program's top margin is WRAPPED_GAP for the stacked case, and
// the column is raised by the rest of BOARD_OFFSET (a negative margin, offset
// by the stage's padding) so the side-by-side case lines up too.
// The two start from their widths, not a flexBasis (NATIVE_PARTS in narrow.ts says why).
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
    width: BOARD_COLUMN_WIDTH,
    marginTop: px(COLUMN_RAISE.times(-1)),
    gap: BOARD_COLUMN_GAP,
  },
  // Its width limit, which keeps room under it for the panel, and for any controls fixed under that.
  limit: { maxWidth: boardColumnLimitCss(false) },
  footLimit: { maxWidth: boardColumnLimitCss(true) },
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
    width: PROGRAM_WIDTH,
    maxWidth: PROGRAM_MAX,
    marginTop: px(WRAPPED_GAP),
  },
  // The gap above is the foot's own: PROGRAM_FOOT is the two together.
  programFoot: { width: '100%', height: px(PROGRAM_FOOT), paddingTop: px(WRAPPED_GAP) },
}));
