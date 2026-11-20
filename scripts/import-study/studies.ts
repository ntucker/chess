/** The lessons the app ships, by lesson id, and the sources each is read from. */
import type { ChapterName, LessonInfo } from './merge';
import type { WikibooksOptions } from './wikibooks';

/** A lichess study, by its id. */
interface StudySource {
  readonly study: string;
  readonly chapters: (title: string) => boolean;
  /** The variation each chapter names; the importer's default reads titles like the Caro-Kann's. */
  readonly chapterName?: ChapterName;
}

/** Pages of Wikibooks' Chess Opening Theory (wikibooks.ts), the learner being the lesson's side. */
type WikibooksSource = Omit<WikibooksOptions, 'learner' | 'log'>;

export type ChapterSource = StudySource | WikibooksSource;

interface Lesson {
  /**
   * Where the chapters come from, in the order `info.sources` credits them:
   * where two overlap, the earlier one's recommended moves win.
   */
  readonly from: readonly ChapterSource[];
  /**
   * Check the merged lesson with Stockfish (engineCheck.ts) before it is
   * written: for lessons merged from several guides, which no one author vouches for.
   */
  readonly engineCheck?: boolean;
  readonly info: LessonInfo;
}

export const STUDIES: Readonly<Record<string, Lesson>> = {
  'caro-kann': {
    from: [
      {
        study: '8Uztu7Xx',
        /** The theory chapters: 🔵 core and 🟢 extra. Guides, plans and model games come later. */
        chapters: (title: string) => /^(?:🔵|🟢)/u.test(title),
      },
    ],
    info: {
      id: 'caro-kann',
      title: 'Caro-Kann Defence',
      side: 'black',
      sources: [
        {
          title: 'Greatest Caro Kann: Living Repertoire',
          author: 'Kampfschach_Official',
          url: 'https://lichess.org/study/8Uztu7Xx',
        },
      ],
    },
  },
  slav: {
    from: [
      {
        study: 'LGKgEao4',
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
    ],
    engineCheck: true,
    info: {
      id: 'slav',
      title: 'Slav Defence',
      side: 'black',
      sources: [
        {
          title: 'Black repertoaire: Slav Defense',
          author: 'MMatkun',
          url: 'https://lichess.org/study/LGKgEao4',
        },
        {
          title: 'Slav Defense, Main Line',
          author: 'Kitsune_Cavalry',
          url: 'https://lichess.org/study/aOkYYHpw',
        },
        {
          title: 'Chess Opening Theory',
          author: 'Wikibooks contributors',
          url: 'https://en.wikibooks.org/wiki/Chess_Opening_Theory/1._d4/1...d5/2._c4/2...c6',
          license: { name: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' },
        },
      ],
    },
  },
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
