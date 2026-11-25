import { opposite } from '@/game/replay';
import { DEFAULT_SETTINGS } from '@/settings/settings';

// The pre-rendered home page draws its still board (`StillGame` in Stage.tsx)
// for the side the learner last played, which only the browser knows: the
// export draws it for the default side, and the page's head turns it around
// before the first paint when the learner saved the other: its script sets
// <html data-side> (`PRE_PAINT_SCRIPT`, src/theme/schemeCss.ts) and this
// file's rule turns the board (src/app/+html.tsx).

/** The props that mark a board to turn when the saved side isn't the default. */
export const SAVED_SIDE_PROPS = { dataSet: { still: 'saved-side' } } as const;

const turned = `:root[data-side=${opposite(DEFAULT_SETTINGS.side)}] [data-still=saved-side]`;

/**
 * Turns a marked board around for the other side: a half turn flips its ranks
 * and files, and a half turn of each piece (an SVG) stands it back up.
 */
export const SAVED_SIDE_CSS = `${turned},${turned} svg{transform:rotate(180deg)}`;
