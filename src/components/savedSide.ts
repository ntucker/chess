import { readStorageScript } from '@/context/storage';
import { COLORS, opposite } from '@/game/replay';
import { DEFAULT_SETTINGS, SETTINGS_KEY } from '@/settings/settings';

// The pre-rendered home page draws its still board (`StillGame` in Stage.tsx)
// from the side the learner last played, which only the browser knows: the
// export draws it for the default side, and the page's head turns it around
// before the first paint when the learner saved the other (src/app/+html.tsx).

/** The props that mark an element to turn around when the saved side isn't the default. */
export const SAVED_SIDE_PROPS = { dataSet: { still: 'saved-side' } } as const;

/** A script that, before the first paint, sets <html data-side> to the side the learner saved. */
export const SAVED_SIDE_SCRIPT =
  `try{var s=JSON.parse(${readStorageScript(SETTINGS_KEY)}).side;` +
  `if(${JSON.stringify(COLORS)}.indexOf(s)>=0)document.documentElement.dataset.side=s}catch(e){}`;

const turned = `:root[data-side=${opposite(DEFAULT_SETTINGS.side)}] [data-still=saved-side]`;

/**
 * Turns a marked board around for the other side: a half turn flips its ranks
 * and files, and a half turn of each piece (an SVG) stands it back up.
 */
export const SAVED_SIDE_CSS = `${turned},${turned} svg{transform:rotate(180deg)}`;
