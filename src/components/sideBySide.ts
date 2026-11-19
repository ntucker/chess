import { phoneLength } from '@/theme/phone';

/** The board column's flex basis: the width it starts from beside the panel. */
export const BOARD_COLUMN_BASIS = 320;
/** The panel's flex basis. */
export const PROGRAM_BASIS = 300;
/** Space between the board column and the panel beside it. */
export const STAGE_GAP = 48;
/** The page's padding, and the space between the header and the stage. */
export const PAGE_SPACE = phoneLength('page-space', 20);
/**
 * The narrowest window with the board column and the panel side by side.
 * phone.css's media query starts just below it, so a narrower page stacks
 * them and gets the narrow layout in one step (phone.test.ts checks).
 */
export const SIDE_BY_SIDE_MIN =
  BOARD_COLUMN_BASIS + STAGE_GAP + PROGRAM_BASIS + 2 * PAGE_SPACE.wide;
