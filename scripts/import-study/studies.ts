/** The lessons the app ships, by lesson id, and the sources each is read from. */
import { numberedLine } from '@/game/replay';
import type { LessonSource } from '@/lesson/lesson';

import type { ChapterName, LessonInfo } from './merge';
import { rootSans, type WikibooksOptions } from './wikibooks';

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

/**
 * Wikibooks' text is CC BY-SA 4.0, so a lesson that adapts it is shared under
 * that license too. Titled with its root's moves, so a lesson reading two
 * roots credits two pages: "Chess Opening Theory, 1.d4 d5 2.Bf4".
 */
const wikibooksCredit = (root: string): LessonSource => ({
  title: `Chess Opening Theory, ${numberedLine(rootSans(root))}`,
  author: 'Wikibooks contributors',
  url: `https://en.wikibooks.org/wiki/${root}`,
  license: { name: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' },
});

/** The lesson's info for merging, crediting each of its sources in order. */
export const lessonInfo = ({ info, from }: LessonRecipe): LessonInfo => ({
  ...info,
  sources: from.map(credit),
});

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
      },
    ],
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
        chapterName: (title: string) => chapterNamed(SLAV_CHAPTERS, 'Slav', title),
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
    ],
    engineCheck: true,
    info: {
      id: 'slav',
      title: 'Slav Defence',
      side: 'black',
    },
  },
  london: {
    from: [
      {
        study: '0jynK1KI',
        credit: {
          title: 'The London System',
          author: 'AverageLondonEnjoyer',
          url: 'https://lichess.org/study/0jynK1KI',
        },
        chapters: () => true,
        chapterName: (title: string) => chapterNamed(LONDON_CHAPTERS, 'London', title),
      },
      {
        study: '2EaSmZtz',
        credit: {
          title: 'London System Repertoire',
          author: 'davidharoldchess',
          url: 'https://lichess.org/study/2EaSmZtz',
        },
        // The introduction is a picture of the setup and the Stonewall chapter is empty.
        chapters: (title: string) => Object.hasOwn(DAVID_LONDON_CHAPTERS, title),
        chapterName: (title: string) => DAVID_LONDON_CHAPTERS[title],
      },
      { root: 'Chess_Opening_Theory/1._d4/1...d5/2._Bf4' },
      { root: 'Chess_Opening_Theory/1._d4/1...Nf6/2._Bf4' },
    ],
    engineCheck: true,
    info: {
      id: 'london',
      title: 'London System',
      side: 'white',
    },
  },
  'anti-london': {
    from: [
      {
        study: '8vdDkGEV',
        credit: {
          title: 'London System (Black)',
          author: 'Coldfield1994',
          url: 'https://lichess.org/study/8vdDkGEV',
        },
        chapters: () => true,
        chapterName: (title: string) => chapterNamed(COLDFIELD_CHAPTERS, 'anti-London', title),
      },
      {
        study: 'Pg7swJlZ',
        credit: {
          title: 'Anti-London System Lines',
          author: 'idontcareman88',
          url: 'https://lichess.org/study/Pg7swJlZ',
        },
        // The 1...d5 chapter; the others answer 1.d4 with 1...Nf6, and the example games come later.
        chapters: (title: string) => title === '1...d5 Set-up',
        chapterName: () => undefined,
      },
      { root: 'Chess_Opening_Theory/1._d4/1...d5/2._Bf4' },
    ],
    engineCheck: true,
    info: {
      id: 'anti-london',
      title: 'Anti-London',
      side: 'black',
    },
  },
};

/**
 * The variation `names` gives the chapter `title` of a study whose titles
 * follow no pattern. A chapter the study gained since must be named here, not
 * land on the opening.
 */
function chapterNamed(
  names: Readonly<Record<string, string | undefined>>,
  study: string,
  title: string,
): string | undefined {
  if (!Object.hasOwn(names, title)) throw new Error(`Name the ${study} chapter "${title}"`);
  return names[title];
}

/** AverageLondonEnjoyer's chapters, each Black's reply to the London, as variation names. */
const LONDON_CHAPTERS: Readonly<Record<string, string | undefined>> = {
  Introduction: undefined,
  'London vs. Main Line, ...Bd6': 'Main Line: ...Bd6',
  'London vs. Main Line, ...Be7': 'Main Line: ...Be7',
  'London vs. Early Bf5': 'Early ...Bf5',
  'London vs. 2... c5 (anti-London)': 'Anti-London ...c5',
  'London vs. KID': "King's Indian",
  'London vs. Grunfeld': 'Grünfeld',
  'London vs. QID': "Queen's Indian",
  'London vs. Dutch': 'Dutch',
  'London vs. "Offbeat" Lines': 'Offbeat Lines',
};

/** The davidharoldchess chapters the lesson reads, as variation names. */
const DAVID_LONDON_CHAPTERS: Readonly<Record<string, string | undefined>> = {
  'London System Basics': undefined,
  'London vs d5 e6 Part 1': 'Main Line',
  'London vs d5 e6 Part 2': 'Main Line',
  'London vs d5 c5 Part 1': 'Anti-London ...c5',
  'London vs KID/Grunfeld': "King's Indian",
  'London vs Benoni': 'Benoni',
  'London vs Old Benoni': 'Old Benoni',
  'Alternative London System': 'Main Line',
  'London System vs cxd4': 'Anti-London ...c5',
  'London System vs Ne4': 'Anti-London ...c5',
  'London System vs Bf5': 'Early ...Bf5',
  'Anti-Londons Part 1': 'Anti-London ...c5',
  'Anti-Londons Part 2': 'Offbeat Lines',
  'Anti-Londons Part 3': 'Offbeat Lines',
  'Anti-Londons Part 4': 'Offbeat Lines',
  'Anti-Londons Part 5': 'Anti-London ...c5',
};

/** Coldfield1994's chapters, each going on from the last, as variation names. */
const COLDFIELD_CHAPTERS: Readonly<Record<string, string | undefined>> = {
  'Opening Position : London System': undefined,
  'London System + 3...c5 : Main Line': 'Main Line',
  'Main Line + 4.e3': 'Main Line',
  'Main Line + 4.e3 Nc6': 'Main Line',
  'Main Line + 4.e3 Nc6, 5.c3 : Standard London': 'Main Line: Standard London',
  'Standard London + 5...Qb6': 'Main Line: Standard London',
  'Standard London + 5...Qb6, 6.Qb3 : Queen Standoff Line': 'Main Line: Queen Standoff',
  'Standard London + 5...Nh5 : Nh5 Sideline': 'Main Line: 5...Nh5',
  'Nh5 Sideline + 6.Bg3': 'Main Line: 5...Nh5',
  'Nh5 Sideline + 6.Bg4? : Bg4? Tactical Response, Part 1': 'Main Line: 5...Nh5',
  'Bg4? Tactical Response, Part 2': 'Main Line: 5...Nh5',
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
