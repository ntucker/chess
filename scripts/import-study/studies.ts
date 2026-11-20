/** The lessons the app ships, by lesson id, and the sources each is read from. */
import type { LessonSource } from '@/lesson/lesson';

import { numberedChapterName, type ChapterName, type LessonInfo } from './merge';
import type { WikibooksOptions } from './wikibooks';

/** A lichess study, by its id. */
interface StudySource {
  /** How the lesson credits it. */
  readonly credit: LessonSource;
  readonly study: string;
  readonly chapters: (title: string) => boolean;
  /** The variation each chapter names; the importer's default reads titles like the Caro-Kann's. */
  readonly chapterName?: ChapterName;
}

/**
 * Pages of Wikibooks' Chess Opening Theory (wikibooks.ts), the learner being
 * the lesson's side. Credited by its root page (`wikibooksCredit`).
 */
type WikibooksSource = Omit<WikibooksOptions, 'learner' | 'log'>;

export type ChapterSource = StudySource | WikibooksSource;

interface LessonRecipe {
  /**
   * Where the chapters come from, credited in this order (`lessonInfo`):
   * where two overlap, the earlier one's recommended moves win.
   */
  readonly from: readonly ChapterSource[];
  /**
   * Check the merged lesson with Stockfish (engineCheck.ts) before it is
   * written: for lessons merged from several guides, which no one author vouches for.
   */
  readonly engineCheck?: boolean;
  readonly info: Omit<LessonInfo, 'sources'>;
}

/** How a lesson credits a source. */
export const credit = (from: ChapterSource): LessonSource =>
  'study' in from ? from.credit : wikibooksCredit(from.root);

/** Wikibooks' text is CC BY-SA 4.0, so a lesson that adapts it is shared under that license too. */
const wikibooksCredit = (root: string): LessonSource => ({
  title: 'Chess Opening Theory',
  author: 'Wikibooks contributors',
  url: `https://en.wikibooks.org/wiki/${root}`,
  license: { name: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' },
});

/** The lesson's info for merging, crediting each of its sources in order. */
export const lessonInfo = ({ info, from }: LessonRecipe): LessonInfo => ({
  ...info,
  sources: from.map(credit),
});

/** wub1234's repertoire of 1...c6 against everything: its Caro-Kann and Slav chapters feed those lessons. */
const WUB_C6 = {
  study: 'iFA7tZcn',
  credit: {
    title: 'Complete Black c6 Repertoire',
    author: 'wub1234',
    url: 'https://lichess.org/study/iFA7tZcn',
  },
} as const;

export const STUDIES: Readonly<Record<string, LessonRecipe>> = {
  'caro-kann': {
    from: [
      {
        study: '8Uztu7Xx',
        credit: {
          title: 'Greatest Caro Kann: Living Repertoire',
          author: 'Kampfschach_Official',
          url: 'https://lichess.org/study/8Uztu7Xx',
        },
        /** The theory chapters: 🔵 core and 🟢 extra. Guides, plans and model games come later. */
        chapters: (title: string) => /^(?:🔵|🟢)/u.test(title),
        // "Sidelines Index" names the chapter's contents page, not a variation.
        chapterName: (title, chapter) =>
          numberedChapterName(title, chapter)?.replace(/: Sidelines Index$/, ''),
      },
      {
        root: 'Chess_Opening_Theory/1._e4/1...c6',
        rename: {
          'Advance variation': 'Advance Variation',
          'Tal variation': 'Tal Variation (4.h4) & Bayonet Attack (4.g4)',
          'Classical variation': 'Classical Variation',
          // 3.Nd2, which the main study teaches under the Classical Variation.
          'Modern variation': '',
          'Accelerated Panov attack': 'Accelerated Panov',
          'Breyer variation': '2.d3 Systems: Breyer Variation',
          'Endgame offer': '',
          'Dinic gambit': '',
        },
      },
      {
        ...WUB_C6,
        chapters: (title: string) => Object.hasOwn(WUB_CARO_KANN, title),
        chapterName: (title: string) => WUB_CARO_KANN[title],
      },
    ],
    engineCheck: true,
    info: {
      id: 'caro-kann',
      title: 'Caro-Kann Defence',
      side: 'black',
    },
  },
  slav: {
    from: [
      {
        study: 'LGKgEao4',
        credit: {
          title: 'Black repertoaire: Slav Defense',
          author: 'MMatkun',
          url: 'https://lichess.org/study/LGKgEao4',
        },
        chapters: () => true,
        chapterName: (title: string) => {
          // A chapter the study gained since must be named here, not land on the opening.
          if (!Object.hasOwn(SLAV_CHAPTERS, title))
            throw new Error(`Name the Slav chapter "${title}"`);
          return SLAV_CHAPTERS[title];
        },
      },
      {
        study: 'aOkYYHpw',
        credit: {
          title: 'Slav Defense, Main Line',
          author: 'Kitsune_Cavalry',
          url: 'https://lichess.org/study/aOkYYHpw',
        },
        // The theory chapters; the master games after them come later.
        chapters: (title: string) => Object.hasOwn(KITSUNE_CHAPTERS, title),
        chapterName: (title: string) => KITSUNE_CHAPTERS[title],
      },
      {
        root: 'Chess_Opening_Theory/1._d4/1...d5/2._c4/2...c6',
        rename: {
          // 3...Nf6, which the main study's own chapters start under.
          'Modern Line': '',
          'Slav accepted': 'Pure Slav',
          'Alapin variation': 'Alapin Variation',
          'Exchange variation': 'Exchange Variation',
        },
      },
      {
        // 3.Nc3 e6, the Semi-Slav by its other move order (2...e6 3.Nc3 c6), which the main study only names.
        study: 'mKEnJPUG',
        credit: {
          title: 'How to play the SEMI-SLAV DEFENSE',
          author: 'ChessWillNotHurt1',
          url: 'https://lichess.org/study/mKEnJPUG',
        },
        // The two lessons; the first chapter has no moves and the practice quiz repeats them.
        chapters: (title: string) => title === 'Semi-Slav as Black' || title === 'Chapter 4',
        chapterName: () => 'Semi-Slav',
      },
      {
        // Its chapters reaching the Slav by 1.d4 c6 2.c4 d5, for 3.e3 and the Exchange Variation's 4.Nf3.
        ...WUB_C6,
        chapters: (title: string) => Object.hasOwn(WUB_SLAV, title),
        chapterName: (title: string) => WUB_SLAV[title],
      },
      {
        // The Semi-Slav by 2...e6 3.Nc3 c6 (the Triangle): 4.e3 and the Marshall Gambit 4.e4.
        root: 'Chess_Opening_Theory/1._d4/1...d5/2._c4/2...e6/3._Nc3/3...c6',
        topName: 'Semi-Slav',
        rename: {
          'Noteboom variation': 'Noteboom Variation',
          'Marshall gambit': 'Marshall Gambit',
        },
      },
      {
        study: 'Z4TK3dUu',
        credit: {
          title: 'Slav Defense overview for Black',
          author: 'Wurzelkraft',
          url: 'https://lichess.org/study/Z4TK3dUu',
        },
        // The theory chapters, not "Conversions into Slav" (from 1.c4) or the example games.
        chapters: (title: string) => Object.hasOwn(WURZELKRAFT_CHAPTERS, title),
        chapterName: (title: string) => WURZELKRAFT_CHAPTERS[title],
      },
    ],
    engineCheck: true,
    info: {
      id: 'slav',
      title: 'Slav Defence',
      side: 'black',
    },
  },
};

/** wub1234's chapters after 1.e4 c6, as the Caro-Kann lesson's variation names. */
const WUB_CARO_KANN: Readonly<Record<string, string | undefined>> = {
  'e4 – The Caro-Kann': undefined,
  '2. d4 Lines – The Advance Variation': 'Advance Variation',
  '2. d4 Lines – The Classical Caro-Kann': 'Classical Variation',
  '2. d4 Lines – The Exchange Variation': 'Exchange Variation',
  '2. d4 Lines – The Panov-Botvinnik Attack': 'Panov-Botvinnik Attack',
  '2. d4 Lines – The Fantasy Variation': 'Fantasy Variation',
  'Other Second Moves – 2. Nf3 – Two Knights Variation': 'Two Knights Attack',
  'Other Second Moves – 2. Bc4 – The Hillbilly Attack': 'Everything Else',
  'Other Second Moves – 2. c4': 'Accelerated Panov',
  'Other Second Moves – 2. Nc3': 'Two Knights Attack',
};

/** wub1234's chapters reaching the Slav (by 1.d4 c6 2.c4 d5), as the Slav lesson's variation names. */
const WUB_SLAV: Readonly<Record<string, string | undefined>> = {
  'Likely Response – 2. c4': undefined,
  'Inviting the Slav – 3. Nf3': undefined,
  'Exchange Variation – 3. cxd5': 'Exchange Variation',
  "Queen's Gambit – 3. e3": '3.e3',
};

/** Wurzelkraft's theory chapters, as variation names. */
const WURZELKRAFT_CHAPTERS: Readonly<Record<string, string | undefined>> = {
  Intro: undefined,
  'Open Slav': 'Pure Slav',
  'Semi Slav': 'Semi-Slav',
  'Stonewall in Semi-Slav': 'Semi-Slav',
  'Exchange Slav': 'Exchange Variation',
  Dangers: undefined,
};

/** The Slav study's chapter titles, which follow no pattern, as variation names; undefined for the opening itself. */
const SLAV_CHAPTERS: Readonly<Record<string, string | undefined>> = {
  Introduction: undefined,
  'Slav Defense : Pure Slav': 'Pure Slav',
  'Introduction to Semi-Slav': 'Semi-Slav',
  'Slav Defense: Semi Slav 5.e3': 'Semi-Slav: 5.e3',
  'Slav Defense: Semi Slav 5.Bg5': 'Semi-Slav: 5.Bg5',
  'Slav Defense : Exchange variation': 'Exchange Variation',
  'Slav Defense:  4. Qc2': '4.Qc2',
  'Slav Defense: 4.Qb3': '4.Qb3',
};

/** The theory chapters of Kitsune_Cavalry's study, all after 4...dxc4, as variation names. */
const KITSUNE_CHAPTERS: Readonly<Record<string, string | undefined>> = {
  Introduction: 'Pure Slav',
  '5. a4 Alapin Variation': 'Pure Slav: Alapin Variation',
  '5. e4 The Geller Gambit': 'Pure Slav: Geller Gambit',
  '5. e3 Alekhine Variation': 'Pure Slav: Alekhine Variation',
  '5. g3': 'Pure Slav: 5.g3',
  '5. Ne5': 'Pure Slav: 5.Ne5',
};
