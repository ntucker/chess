/** The lessons the app ships, by lesson id, and the sources each is read from. */
import { numberedLine } from '@/game/replay';
import type { Color } from 'chessops/types';

import type { LessonSource } from '@/lesson/lesson';

import { numberedChapterName, type ChapterName, type LessonInfo } from './merge';
import { rootSans, type WikibooksOptions } from './wikibooks';

/** A lichess study, by its id. */
interface StudySource {
  /** How the lesson credits it. */
  readonly credit: LessonSource;
  readonly study: string;
  readonly chapters: (title: string) => boolean;
  /** The variation each chapter names; the importer's default reads titles like the Caro-Kann's. */
  readonly chapterName?: ChapterName;
  /**
   * The side the study was written for, when it is not the lesson's: a London
   * study read for the anti-London. It books none of the learner's moves, so
   * where it alone shows them `fillBook` picks one with Stockfish, and the
   * model rewrites its comments for the learner (`Chapter.writtenFor`).
   */
  readonly writtenFor?: Color;
  /**
   * Replies the study names in words where its line stops, read as its own
   * moves (`withReplies`): the line's moves in SAN from the start, then the reply.
   */
  readonly replies?: Readonly<Record<string, string>>;
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

/**
 * The lesson's info for merging, crediting each of its sources in order,
 * once each: a study read twice (its chapters for each side) is one source.
 */
export const lessonInfo = ({ info, from }: LessonRecipe): LessonInfo => ({
  ...info,
  sources: [...new Map(from.map(credit).map((source) => [source.url, source])).values()],
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

/** loloriv's Sicilian course, Black's side except where White picks the line. */
const LOLORIV_SICILIAN = {
  study: 'lUPzQLo3',
  credit: {
    title: 'Sicilian Defense',
    author: 'loloriv',
    url: 'https://lichess.org/study/lUPzQLo3',
  },
} as const;

/** loloriv's Ruy Lopez course, White's side except for the Berlin. */
const LOLORIV_RUY = {
  study: 'Trmr5pwd',
  credit: {
    title: 'Ruy Lopez',
    author: 'loloriv',
    url: 'https://lichess.org/study/Trmr5pwd',
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
          'Tal variation': 'Tal Variation (4.h4) & Bayonet Attack (4.g4)',
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
        // "Black can easily recapture the pawn with Bxc5 after ... defending d5 with e6."
        replies: { 'd4 d5 Bf4 Nf6 Nf3 c5 dxc5': 'e6' },
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
      // 2...Nf6 by the other move order: 3.e3, and the 3.Nc3 that leads into the next root.
      { root: 'Chess_Opening_Theory/1._d4/1...Nf6/2._Bf4/2...d5' },
      // The Jobava London (3.Nc3), which Wikibooks reaches by 1.d4 Nf6 2.Nc3 d5 3.Bf4.
      { root: 'Chess_Opening_Theory/1._d4/1...Nf6/2._Nc3/2...d5/3._Bf4' },
      {
        // White's view of ...c5: what White plans against it, reworded for Black. It books
        // none of Black's moves; where only it shows them, Stockfish picks one.
        study: '2EaSmZtz',
        credit: {
          title: 'London System Repertoire',
          author: 'davidharoldchess',
          url: 'https://lichess.org/study/2EaSmZtz',
        },
        writtenFor: 'white',
        // Its ...c5 chapters reached by 1...d5; "vs Ne4" starts 1...Nf6 and "Part 5" is empty.
        chapters: (title: string) => Object.hasOwn(DAVID_ANTI_LONDON_CHAPTERS, title),
        chapterName: (title: string) => DAVID_ANTI_LONDON_CHAPTERS[title],
      },
    ],
    engineCheck: true,
    info: {
      id: 'anti-london',
      title: 'Anti-London',
      side: 'black',
    },
  },
  sicilian: {
    from: [
      {
        ...LOLORIV_SICILIAN,
        // Black's theory chapters; the reviews replay them as quizzes or master games.
        chapters: (title: string) => Object.hasOwn(SICILIAN_CHAPTERS, title),
        chapterName: (title: string) => SICILIAN_CHAPTERS[title],
      },
      {
        // The chapters showing White's setups, reworded for Black: they book none of Black's moves.
        ...LOLORIV_SICILIAN,
        writtenFor: 'white',
        chapters: (title: string) => Object.hasOwn(SICILIAN_WHITE_CHAPTERS, title),
        chapterName: (title: string) => SICILIAN_WHITE_CHAPTERS[title],
      },
    ],
    engineCheck: true,
    info: {
      id: 'sicilian',
      title: 'Sicilian Defence',
      side: 'black',
    },
  },
  'ruy-lopez': {
    from: [
      {
        ...LOLORIV_RUY,
        // White's theory chapters; the reviews replay them as quizzes or master games.
        chapters: (title: string) => Object.hasOwn(RUY_CHAPTERS, title),
        chapterName: (title: string) => RUY_CHAPTERS[title],
      },
      {
        // The Berlin, shown from Black's side, reworded for White: it books none of White's moves.
        ...LOLORIV_RUY,
        writtenFor: 'black',
        chapters: (title: string) => title === 'Berlin Defense Theory',
        chapterName: () => 'Berlin Defence',
      },
    ],
    engineCheck: true,
    info: {
      id: 'ruy-lopez',
      title: 'Ruy Lopez',
      side: 'white',
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

/** The davidharoldchess chapters the anti-London reads, as variation names: none of their own. */
const DAVID_ANTI_LONDON_CHAPTERS: Readonly<Record<string, string | undefined>> = {
  'London vs d5 c5 Part 1': undefined,
  'Anti-Londons Part 1': undefined,
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

/** loloriv's Black theory chapters, as variation names. */
const SICILIAN_CHAPTERS: Readonly<Record<string, string | undefined>> = {
  Introduction: undefined,
  'Open Sicilian Introduction': 'Open Sicilian',
  'Najdorf Sicilian English Attack Theory': 'Najdorf Variation: English Attack',
  'Najdorf Sicilian Main Line Theory': 'Najdorf Variation: 6.Bg5',
  'Najdorf Sicilian Opočenský Theory': 'Najdorf Variation: Opočenský Variation',
  'Najdorf Sicilian Fischer-Sozin Attack Theory': 'Najdorf Variation: Fischer-Sozin Attack',
  'Sveshnikov Sicilian Theory': 'Sveshnikov Variation',
  'Classical Sicilian Theory': 'Classical Variation',
  'Dragon Sicilian Theory': 'Dragon Variation',
  'Accelerated Dragon Theory': 'Accelerated Dragon',
  'Hyper-Accelerated Dragon Theory': 'Hyper-Accelerated Dragon',
  'Taimanov Sicilian': 'Taimanov Variation',
  'Kalashnikov Sicilian Theory': 'Kalashnikov Variation',
  'Scheveningen Sicilian': 'Scheveningen Variation',
  'Closed Sicilian': 'Closed Sicilian',
  'Fianchetto Variation': 'Closed Sicilian: Fianchetto Variation',
  'Grand Prix Attack': 'Grand Prix Attack',
  'Alapin Siclian': 'Alapin Variation',
  'Smith-Morra Gambit': 'Smith-Morra Gambit',
  'McDonnell Attack': 'McDonnell Attack',
  'Prins Sicilian': 'Prins Variation',
  'Bowdler Attack "Theory"': 'Bowdler Attack',
};

/** loloriv's chapters written from White's side, as variation names. */
const SICILIAN_WHITE_CHAPTERS: Readonly<Record<string, string | undefined>> = {
  'Nyezhmetdinov-Rossolimo Attack': 'Rossolimo Attack',
  'Kramnik Sicilian': 'Kramnik Variation',
};

/** loloriv's White theory chapters, as variation names. */
const RUY_CHAPTERS: Readonly<Record<string, string | undefined>> = {
  'Ruy Lopez Basic Ideas and Principles': undefined,
  'Closed Ruy Lopez Theory': 'Closed Ruy Lopez',
  'Chigorin Variation Theory': 'Closed Ruy Lopez: Chigorin Variation',
  'Breyer Variation Theory': 'Closed Ruy Lopez: Breyer Variation',
  'Marshall Attack Theory': 'Closed Ruy Lopez: Marshall Attack',
  'Arkhangelsk Variation Theory': 'Arkhangelsk Variation',
  'Flohr-Zaitsev System Theory': 'Closed Ruy Lopez: Zaitsev Variation',
  'Open Ruy Lopez Theory': 'Open Ruy Lopez',
  'Exchange Variation Theory': 'Exchange Variation',
};
