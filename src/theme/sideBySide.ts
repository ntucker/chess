import { narrowCalc, narrowLength, PROGRAM_FLOOR, type Px } from '@/theme/narrow';

// The board page's geometry (Stage.tsx), beside the narrow decision that depends on it (Narrow.tsx).

/** The width the board column starts from beside the panel, and grows or shrinks from. */
export const BOARD_COLUMN_WIDTH = 320;
/** The width the panel starts from beside the board. */
export const PROGRAM_WIDTH = 300;
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
  BOARD_COLUMN_WIDTH + STAGE_GAP + PROGRAM_WIDTH + 2 * PAGE_SPACE.wide;

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
/**
 * Height a narrow page's controls fixed under the panel take, with the gap
 * above them (Stage's `programFoot`, such as the review's actions): kept
 * below the board too, on a page that has them. A wide page has none.
 */
export const PROGRAM_FOOT = narrowLength('program-foot', 0);
/** Height around the board, and what is kept below it: the panel's reserve, and any controls under the panel. */
const besideHeight = (foot: boolean) =>
  AROUND_BOARD.plus(PANEL_RESERVE).plus(foot ? PROGRAM_FOOT : 0);
/** Space above the panel when it sits below the board (Stage.tsx). */
export const WRAPPED_GAP = narrowLength('wrapped-gap', 32);
/**
 * A narrow page's least height natively: the board at its smallest, and the
 * panel at its floor below it, which holds any controls under the panel.
 * Shorter, the page scrolls, as narrow.css lets a web page grow.
 */
export const NARROW_PAGE_MIN = AROUND_BOARD.plus(BOARD_MIN)
  .plus(WRAPPED_GAP)
  .plus(PROGRAM_FLOOR).narrow;
/**
 * The board column's width limit on the web, on a page with controls under
 * its panel (`foot`) or without. The board also shrinks to fit the window's
 * height, so the player's name bar and the move buttons stay in view, and
 * on a narrow page the start of the panel and those controls too. CSS does
 * it, since the server can't measure the window; natively `boardColumnLimit`
 * does. `clamp()` has no NarrowLength form, so the two are written apart.
 */
export const boardColumnLimitCss = (foot: boolean) =>
  narrowCalc(
    `clamp(${BOARD_MIN.css}, 100svh - ${besideHeight(foot).css}, ${BOARD_MAX}px) + ${BESIDE_BOARD.css}`,
    BOARD_COLUMN_MAX,
  );

/** `boardColumnLimitCss` off the web: for a window `height` tall, with lengths read by `px`. */
export function boardColumnLimit(height: number, px: Px, foot = false) {
  const board = Math.min(Math.max(px(BOARD_MIN), height - px(besideHeight(foot))), BOARD_MAX);
  return board + px(BESIDE_BOARD);
}
