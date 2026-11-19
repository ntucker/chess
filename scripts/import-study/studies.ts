/** The lichess studies the app ships as lessons, by lesson id. */
import type { ChapterName, LessonInfo } from './merge';

export interface Study {
  readonly study: string;
  readonly chapters: (title: string) => boolean;
  /** The variation each chapter names; the importer's default reads titles like the Caro-Kann's. */
  readonly chapterName?: ChapterName;
  readonly info: LessonInfo;
}

export const STUDIES: Readonly<Record<string, Study>> = {
  'caro-kann': {
    study: '8Uztu7Xx',
    /** The theory chapters: 🔵 core and 🟢 extra. Guides, plans and model games come later. */
    chapters: (title: string) => /^(?:🔵|🟢)/u.test(title),
    info: {
      id: 'caro-kann',
      title: 'Caro-Kann Defence',
      side: 'black',
      source: {
        title: 'Greatest Caro Kann: Living Repertoire',
        author: 'Kampfschach_Official',
        url: 'https://lichess.org/study/8Uztu7Xx',
      },
    },
  },
  slav: {
    study: 'LGKgEao4',
    chapters: () => true,
    chapterName: (title: string) => {
      // A chapter the study gained since must be named here, not land on the opening.
      if (!Object.hasOwn(SLAV_CHAPTERS, title)) throw new Error(`Name the Slav chapter "${title}"`);
      return SLAV_CHAPTERS[title];
    },
    info: {
      id: 'slav',
      title: 'Slav Defence',
      side: 'black',
      source: {
        title: 'Black repertoaire: Slav Defense',
        author: 'MMatkun',
        url: 'https://lichess.org/study/LGKgEao4',
      },
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
