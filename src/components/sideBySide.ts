import { narrowCalc, narrowLength, type Px } from '@/theme/narrow';

// The board page's geometry (Stage.tsx), in one module free of components, so tests can reach it.

/** The board column's flex basis: the width it starts from beside the panel. */
export const BOARD_COLUMN_BASIS = 320;
/** The panel's flex basis. */
export const PROGRAM_BASIS = 300;
/** Space between the board column and the panel beside it. */
export const STAGE_GAP = 48;
/** The page's padding, and the space between the header and the stage. */
export const PAGE_SPACE = narrowLength('page-space', 20);
/**
 * The narrowest window with the board column and the panel side by side.
 * narrow.css's media query starts just below it, so a narrower page stacks
 * them and gets the narrow layout in one step (narrow.test.ts checks).
 */
export const SIDE_BY_SIDE_MIN =
  BOARD_COLUMN_BASIS + STAGE_GAP + PROGRAM_BASIS + 2 * PAGE_SPACE.wide;

/** The header's height: its logo, the tallest thing in it (Header.tsx). Shorter on a narrow page. */
export const HEADER_HEIGHT = narrowLength('header-height', 40);

/**
 * A player's disc's size and the space after it (PlayerBar.tsx), so the
 * screen can line things up with them. A small dot on a narrow page, to give
 * the board room.
 */
export const PLAYER_DISC = {
  size: narrowLength('player-disc', 28),
  gap: narrowLength('player-disc-gap', 12),
} as const;

/**
 * The name bars' heights, fixed so the panel lines up with the board: the
 * player's, with the move stepper, and the opponent's, with only its names
 * and at most a small switch. Shorter on a narrow page, where the names
 * share one line.
 */
export const PLAYER_BAR_HEIGHT = {
  controls: narrowLength('controls-bar-height', 60),
  names: narrowLength('names-bar-height', 60),
} as const;
/** Space between the board and the name bars above and below it. */
export const BOARD_COLUMN_GAP = 4;
/** How far the board sits below the top of its column (the opponent's name bar). */
export const BOARD_OFFSET = PLAYER_BAR_HEIGHT.names.plus(BOARD_COLUMN_GAP);
/** How far the board sits above the bottom of its column (the player's bar, with the stepper). */
const BOARD_UNDER = PLAYER_BAR_HEIGHT.controls.plus(BOARD_COLUMN_GAP);
/** The board's largest size. */
const BOARD_MAX = 720;
/** The width the column adds beside the board: the players' discs and their gap. */
const BESIDE_BOARD = PLAYER_DISC.size.plus(PLAYER_DISC.gap);
/** The board column's largest width. */
export const BOARD_COLUMN_MAX = BOARD_MAX + BESIDE_BOARD.wide;
/**
 * Height around the board: the page's top and bottom padding and the gap
 * below the header (3 × PAGE_SPACE), the header, and both name bars.
 */
const AROUND_BOARD = PAGE_SPACE.times(3).plus(HEADER_HEIGHT).plus(BOARD_OFFSET).plus(BOARD_UNDER);
/** The smallest the board shrinks to in a short window. */
const BOARD_MIN = narrowLength('board-min', 320);
/** Height kept below the board column for the panel: none beside it, some below it on a narrow page. */
const PANEL_RESERVE = narrowLength('panel-reserve', 0);
/** Height around the board, and the panel's reserve below it. */
const BESIDE_HEIGHT = AROUND_BOARD.plus(PANEL_RESERVE);
/**
 * The board column's width limit on the web. The board also shrinks to fit
 * the window's height, so the player's name bar and the move buttons stay in
 * view, and on a narrow page the start of the panel too. CSS does it, since
 * the server can't measure the window; natively `boardColumnLimit` does.
 * `clamp()` has no NarrowLength form, so the two are written apart.
 */
export const BOARD_COLUMN_LIMIT_CSS = narrowCalc(
  `clamp(${BOARD_MIN.css}, 100svh - ${BESIDE_HEIGHT.css}, ${BOARD_MAX}px) + ${BESIDE_BOARD.css}`,
  BOARD_COLUMN_MAX,
);

/** `BOARD_COLUMN_LIMIT_CSS` off the web: for a window `height` tall, with lengths read by `px`. */
export function boardColumnLimit(height: number, px: Px) {
  const board = Math.min(Math.max(px(BOARD_MIN), height - px(BESIDE_HEIGHT)), BOARD_MAX);
  return board + px(BESIDE_BOARD);
}
