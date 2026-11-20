// TypeScript resolves './engine' to the Android engine alone; this holds the
// web one to the same contract, so the two can't drift apart unseen.
// eslint-disable-next-line import/no-duplicates -- lint resolves './engine' to the web file too
import type * as android from './engine';
// eslint-disable-next-line import/no-duplicates -- see above
import type * as web from './engine.web';
import type { Engine } from './types';

type Satisfies<T extends Engine> = T;
export type Engines = [Satisfies<typeof android>, Satisfies<typeof web>];
