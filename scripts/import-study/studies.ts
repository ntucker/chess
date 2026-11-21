/** The lessons the app ships, by lesson id, and the sources each is read from. */
import { numberedLine } from '@/game/replay';
import type { Color } from 'chessops/types';

import type { LessonSource } from '@/lesson/lesson';

import { numberedChapterName, type ChapterName, type LessonInfo } from './merge';
import { rootSans, type WikibooksOptions } from './wikibooks';

/** A lichess study, by its id. */
export interface StudySource {
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
   * With `writtenFor`: the study's main line plays the learner's moves the
   * lesson teaches all the same, so they are booked as a lesson's own study's
   * are (davidharoldchess's London against ...Bf5 shows the London mirror
   * Black wants), while its comments are still reworded for the learner.
   */
  readonly recommends?: true;
  /**
   * The ply of the move into the position its chapters' names start at, as a
   * Wikibooks page's (`Chapter.namedFrom`): a King's Gambit study names
   * nothing before 2.f4, so in a lesson teaching other second moves too,
   * 1.e4 e5 stays the opening's. A study about one line of a wider lesson
   * needs it, or being first it names the shared moves.
   */
  readonly namedFrom?: number;
  /**
   * A PGN committed under scripts/import-study/sources/ to read instead of
   * downloading the lichess study: a line that no study teaches. `study` then
   * only names it.
   */
  readonly file?: string;
  /**
   * Replies the source names in words where its line stops, read as its own
   * moves (`withReplies`): the line's moves in SAN from the start, then the reply.
   */
  readonly replies?: Readonly<Record<string, string>>;
  /** Side lines the study plays that the lesson leaves out (`withoutLines`), by their moves in SAN from the start. */
  readonly leave?: readonly string[];
}

/**
 * Pages of Wikibooks' Chess Opening Theory (wikibooks.ts), the learner being
 * the lesson's side. Credited by its root page (`wikibooksCredit`).
 */
export type WikibooksSource = Omit<WikibooksOptions, 'learner' | 'log'> &
  Pick<StudySource, 'replies'>;

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
   * 'gambit' checks a gambit's lesson more gently: it keeps the learner's
   * mistakes that leave a playable position, as the gambit's point.
   */
  readonly engineCheck?: boolean | 'gambit';
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

/** A PGN committed under scripts/import-study/sources/ (`StudySource.file`), credited by its link on GitHub. */
const committedPgn = (file: string, credit: Omit<LessonSource, 'url'>) => ({
  study: file.replace(/\.pgn$/, ''),
  file,
  credit: {
    ...credit,
    url: `https://github.com/ntucker/chess/blob/main/scripts/import-study/sources/${file}`,
  },
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
    title: 'Ruy Lopez Complete Study Guide',
    author: 'loloriv',
    url: 'https://lichess.org/study/Trmr5pwd',
  },
} as const;

/** Bosburp's Queen's Gambit repertoire for White. */
const BOSBURP_QG = {
  study: '0uRBskUV',
  credit: {
    title: "Queen's Gambit | Full Repertoire",
    author: 'Bosburp',
    url: 'https://lichess.org/study/0uRBskUV',
  },
  // The introduction's jokes: "You found the Easter Egg".
  leave: ['b3', 'e4'],
} as const;

/** LeninPerez's Italian for White: the Italian lesson's own, and the open game's reworded for Black. */
const LENIN_ITALIAN = {
  study: 'vJsZScnC',
  credit: {
    title: 'Italian Opening',
    author: 'LeninPerez',
    url: 'https://lichess.org/study/vJsZScnC',
  },
} as const;

/** Kitsune_Cavalry's Evans Gambit for White, in the Italian lesson and the open game. */
const KITSUNE_EVANS = {
  study: 'ZlQ1Gez5',
  credit: {
    title: 'Italian Game, Evans Gambit',
    author: 'Kitsune_Cavalry',
    url: 'https://lichess.org/study/ZlQ1Gez5',
  },
} as const;

/** nohandlebars' Fischer Defense chapters the lesson reads, as variation names. */
const FISCHER_CHAPTERS: Readonly<Record<string, string | undefined>> = {
  Overview: "King's Gambit: Fischer Defence",
  "A Bust To The King's Gambit (Mainline)": "King's Gambit: Fischer Defence",
  'Modern Line': "King's Gambit: Fischer Defence",
};

/** Bosburp's King's Gambit chapters leading to and covering 3...d6, as variation names. */
const BOSBURP_KG_CHAPTERS: Readonly<Record<string, string | undefined>> = {
  '♔ Introduction ♔': undefined,
  "✦ Section 1: King's Gambit Accepted ✦": "King's Gambit",
  'KGA: Fischer Defense 3...d6': "King's Gambit: Fischer Defence",
};

/**
 * LeninPerez's Italian chapters for White, as variation names. Left out: the chapters set up where
 * no chapter goes (Pianissimo ideas after ...O-O, the Legal Trap after 3...d6, a trap after 3...Nf6
 * 4.d4), the trap that has White fall into the Blackburne Shilling, the example games and the
 * conclusion.
 */
const ITALIAN_CHAPTERS: Readonly<Record<string, string | undefined>> = {
  Introduction: undefined,
  'Giuoco Piano': 'Giuoco Piano',
  'Greco Attack': 'Giuoco Piano: Greco Attack',
  'Giuoco Pianissimo': 'Giuoco Piano: Pianissimo',
  'Evans Gambit': 'Evans Gambit',
  // 4.Ng5 d5 5.exd5 Na5. Named for the whole Two Knights, whose first moves only it plays here.
  'Fegatello Attack': 'Two Knights Defence',
};

/** Kitsune_Cavalry's Evans Gambit chapters, as variation names. Not the master game. */
const EVANS_CHAPTERS: Readonly<Record<string, string | undefined>> = {
  Introduction: 'Evans Gambit',
  '4... Nxb4 (not great)': 'Evans Gambit',
  '4... Bb6 (Evans Gambit Declined)': 'Evans Gambit Declined',
  '5... Bf8 Mayet Defense': 'Evans Gambit: Mayet Defence',
  '5... Be7 Anderssen Variation': 'Evans Gambit: Anderssen Variation',
  '5... Bc5 McDonnel Defense': 'Evans Gambit: McDonnell Defence',
  '5... Bd6 Stone-Ware Variation': 'Evans Gambit: Stone-Ware Variation',
  '5... Ba5 6. d4 d6 Main Line, Bronstein Defense (or Lasker Variation later)':
    'Evans Gambit: Bronstein Defence',
  '5... Ba5 6. d4 exd4 Main Line, Pierce Defense': 'Evans Gambit: Pierce Defence',
};

/** Kitsune_Cavalry's Two Knights chapters (4.Ng5), as variation names. */
const KNIGHT_ATTACK_CHAPTERS: Readonly<Record<string, string | undefined>> = {
  Introduction: 'Two Knights Defence',
  '5... Na5 Polerio Defense': 'Two Knights Defence: Polerio Defence',
  '5... b5 Ulvestad Variation': 'Two Knights Defence: Ulvestad Variation',
  '5... Nd4 Fritz Variation': 'Two Knights Defence: Fritz Variation',
};

/** LeninPerez's Italian chapters with ...Bc5, as variation names. */
const LENIN_ITALIAN_CHAPTERS: Readonly<Record<string, string | undefined>> = {
  Introduction: undefined,
  'Giuoco Piano': 'Italian: Giuoco Piano',
  'Greco Attack': 'Italian: Giuoco Piano',
  'Evans Gambit': 'Italian: Giuoco Piano: Evans Gambit',
};

/** Bosburp's introduction chapter, which the Queen's Gambit lesson's own name covers. */
const QG_INTRO = '♕ Introduction ♕';

/**
 * Bosburp's Queen's Gambit chapters, as variation names. A chapter named only by its move takes its
 * section's name, since a heading names no move.
 */
const QG_CHAPTERS: Readonly<Record<string, string | undefined>> = {
  // The lesson's own name.
  [QG_INTRO]: undefined,
  "✦ Section 1: Queen's Gambit Accepted ✦": "Queen's Gambit Accepted",
  'QGA: Rosenthal Defense 3...e6': "Queen's Gambit Accepted: Rosenthal Defence",
  'QGA: Classical Defense 3...Nf6-4...e6-5...c5': "Queen's Gambit Accepted: Classical Defence",
  'QGA: Smyslov Variation 3...Nf6 with 4...g6': "Queen's Gambit Accepted: Smyslov Variation",
  'QGA: Janowski-Larsen Variation 3...Nf6 with 4...Bg4':
    "Queen's Gambit Accepted: Janowski-Larsen Variation",
  'QGA: Gunsberg Defense 3...c5': "Queen's Gambit Accepted: Gunsberg Defence",
  'QGA: Alekhine Defense 3...a6': "Queen's Gambit Accepted: Alekhine Defence",
  'QGA: Slav Gambit 3...b5': "Queen's Gambit Accepted: Slav Gambit",
  'QGA: 4...c5': "Queen's Gambit Accepted",
  'QGA: 3...c6': "Queen's Gambit Accepted",
  'QGA: 3...Bg4?!': "Queen's Gambit Accepted",
  'QGA: 3...Nc6': "Queen's Gambit Accepted",
  "✦ Section 2: Queen's Gambit Declined ✦": "Queen's Gambit Declined",
  'QGD: Exchange Variation 3...Nf6 4. cxd5': "Queen's Gambit Declined: Exchange Variation",
  'QGD: Charousek Variation 3...Be7': "Queen's Gambit Declined: Charousek Variation",
  'QGD: Tarrasch Defense 3...c5': "Queen's Gambit Declined: Tarrasch Defence",
  'QGD: Janowski Variation 3...a6': "Queen's Gambit Declined: Janowski Variation",
  'QGD: 3...dxc4': "Queen's Gambit Declined",
  '✦ Section 3: Slav/Semi-Slav Defense ✦': 'Slav Defence',
  'Slav: Czech Variation 4...dxc4 with 5...Bf5': 'Slav Defence: Czech Variation',
  'Slav: Steiner Variation 4...dxc4 with 5...Bg4': 'Slav Defence: Steiner Variation',
  'Slav: Soultanbeieff Variation 4...dxc4 with 5...e6': 'Slav Defence: Soultanbeieff Variation',
  'Slav: Smyslov Variation 4...dxc4 with 5...Na6': 'Slav Defence: Smyslov Variation',
  'Slav: 3...Bf5': 'Slav Defence',
  'Slav: 4...Bf5': 'Slav Defence',
  'Semi-Slav: Botvinnik Variation 5...dxc4 6. e4': 'Semi-Slav Defence: Botvinnik Variation',
  'Semi-Slav: 5...Be7': 'Semi-Slav Defence',
  'Semi-Slav: 5...Nbd7': 'Semi-Slav Defence',
  'Semi-Slav: Anti-Moscow Gambit 5...h6': 'Semi-Slav Defence: Anti-Moscow Gambit',
  'Semi-Slav: 4...f5 Stonewall-ish': 'Semi-Slav Defence: Stonewall',
  'Semi-Slav: Anti-Noteboom Gambit 4...dxc4 5. g3': 'Semi-Slav Defence: Anti-Noteboom Gambit',
  '✦ Section 4: move 2 sidelines ✦': undefined,
  'Albin Countergambit 2...e5': 'Albin Countergambit',
  'Chigorin Defense 2...Nc6': 'Chigorin Defence',
  'Austrian Defense 2...c5': 'Austrian Defence',
  'Marshall Defense 2...Nf6': 'Marshall Defence',
  'Baltic Defense 2...Bf5': 'Baltic Defence',
  'Zibermints Gambit 2...b5?': 'Zibermints Gambit',
};

/** RadiantSmrf's French chapters, as variation names; the introduction and 3.Nf3 take the lesson's. */
const RADIANT_FRENCH_CHAPTERS: Readonly<Record<string, string | undefined>> = {
  'Introduction - French Defence': undefined,
  'Chapter #1: The Advance Variation - Part #1': 'Advance Variation',
  'Chapter #2: The Advance Variation - Part #2': 'Advance Variation',
  'Chapter #3: The Advance Variation - Part #3': 'Advance Variation',
  'Chapter #4: The Advance Variation - Part #4': 'Advance Variation',
  'Chapter #5: Winawer Variation - Part #1': 'Winawer Variation',
  'Chapter #6: Winawer Variation - Part #2': 'Winawer Variation',
  'Chapter #7: Winawer Variation - Part #3': 'Winawer Variation',
  'Chapter #8 Exchange Variation - Part #1': 'Exchange Variation',
  'Chapter #9 Exchange Variation - Part #2': 'Exchange Variation',
  "Chapter #10 - King's Indian Attack Part #1": "King's Indian Attack",
  "Chapter #11 - King's Indian Attack Part #2": "King's Indian Attack",
  // 2.Nc3 d5 3.Nf3, which the study files under the King's Indian Attack.
  "Chapter #12 - King's Indian Attack Part #3": 'Two Knights Variation',
  "Chapter #14 - King's Indian Attack Part #4": 'Two Knights Variation',
  'Chapter #15 - Two Knights Attack - Part #1': 'Two Knights Variation',
  // The study's titles don't match the moves: #16 is 3.Nd2 dxe4 and #18 is 3.Nc3 dxe4.
  'Chapter #16 - Two Knights Attack - Part #2': 'Rubinstein Variation',
  'Chapter #17 - Tarrasch Variation Part #1': 'Tarrasch Variation',
  'Chapter #18 - Tarrasch Variation Part #2': 'Rubinstein Variation',
  'Chapter #19 - Sidelines and Everything Else Part #1': undefined,
  'Chapter #20 - Sidelines and Everything Else Part #2': 'La Bourdonnais Variation',
  'Chapter #21 - Sidelines and Everything Else Part #3': 'Steiner Variation',
  'Chapter #22 - Sidelines and Everything Else Part #4': 'Steiner Variation',
};

/** MMatkun's French chapters, as variation names. */
const MMATKUN_FRENCH_CHAPTERS: Readonly<Record<string, string | undefined>> = {
  Introduction: undefined,
  'French defense: Advanced Variation with 6.Be2': 'Advance Variation',
  'French defense: Advanced variation with 6.Bd3': 'Advance Variation',
  'French defense : Advanced variation with 6. a3': 'Advance Variation',
  'French defense: Tarrasch variation 3.Nd2 Nf6': 'Tarrasch Variation',
  'French defense : Classical variation 3. Nc3 Bb4 Winaver': 'Winawer Variation',
  'French Defense : Exchange variation aka French killer': 'Exchange Variation',
  'French defense : Exchange variation 4.c4': 'Exchange Variation',
  'French defense: 2.d3': "King's Indian Attack",
  'French defense : 2. Nf3': undefined,
  'French defense : 3.Bd3': undefined,
  // 2.Nf3 d5 3.e5, the Knight Variation. Wikibooks names the Wing Gambit from 4.b4.
  'French defense : Wing gambit': 'Knight Variation',
};

/** Bosburp's 2...Nc6 3.b4 chapters (the Portsmouth Gambit), as variation names. */
const PORTSMOUTH_CHAPTERS: Readonly<Record<string, string | undefined>> = {
  // Ends at 3.b4, where the gambit's three answers part.
  '🚀 == Introduction  == 🚀': undefined,
  '🎯 Section 1: 4...d5': 'Portsmouth Gambit: 4...d5',
  '📕 Introduction to 8. Rb1!!': 'Portsmouth Gambit: 4...d5',
  '📕 Punishing 10...Nb8??': 'Portsmouth Gambit: 4...d5',
  '📕 Punishing 10...Nd8??': 'Portsmouth Gambit: 4...d5',
  '📕 Punishing 10...Na5??': 'Portsmouth Gambit: 4...d5',
  '📕 10...e6': 'Portsmouth Gambit: 4...d5',
  '📕 6...Qe4+?': 'Portsmouth Gambit: 4...d5',
  '📕 6...Qd8': 'Portsmouth Gambit: 4...d5',
  '📕 8...e6': 'Portsmouth Gambit: 4...d5',
  '🌿 Section 2: 4...e6': 'Portsmouth Gambit: 4...e6',
  '📗 5...exd5?!': 'Portsmouth Gambit: 4...e6',
  '📗 5...exd5?! with 6...Qe7+?': 'Portsmouth Gambit: 4...e6',
  '📗 5...Qf6!': 'Portsmouth Gambit: 4...e6',
  '🌊 Section 3: 4...d6?!': 'Portsmouth Gambit: 4...d6',
  '📘 7...f6?!': 'Portsmouth Gambit: 4...d6',
  '📘 7...Qc7/Qd6?!': 'Portsmouth Gambit: 4...d6',
  '📘 7...Nf6': 'Portsmouth Gambit: 4...d6',
  '📙 3...e6?!': 'Portsmouth Gambit Declined',
  '📙 3...Nxb4 with 8...Qd8??': '3...Nxb4',
  '📙 3...Nxb4 with 5...d5': '3...Nxb4',
  '📙 3...Nxb4 with 5...e6': '3...Nxb4',
};

/** Bosburp's 2...d6 3.Bc4 chapters, as variation names. */
const SICILIAN_BC4_CHAPTERS: Readonly<Record<string, string | undefined>> = {
  '🚀 == Introduction  == 🚀': '2...d6 3.Bc4',
  '🎯 Section 1: 3...Nf6': '2...d6 3.Bc4: 3...Nf6',
  '📕 6...Nbd7?? + 5th moves': '2...d6 3.Bc4: 3...Nf6',
  '📕 6...Be7': '2...d6 3.Bc4: 3...Nf6',
  '📕 6...Bd6': '2...d6 3.Bc4: 3...Nf6',
  '🌿 Section 2: 3...e6': '2...d6 3.Bc4: 3...e6',
  '📗 4...Nf6': '2...d6 3.Bc4: 3...e6',
  '📗 4...Nc6': '2...d6 3.Bc4: 3...e6',
  '📗 4...a6': '2...d6 3.Bc4: 3...e6',
  '🌊 Section 3: 3...Nc6 + Various Other Sidelines': '2...d6 3.Bc4: 3...Nc6',
  '📘 3...Nc6': '2...d6 3.Bc4: 3...Nc6',
  '📙 3...Bg4??': '2...d6 3.Bc4',
  '📙 3...g6': '2...d6 3.Bc4: 3...g6',
};

/** Arco47's Bishop's Opening chapters, as variation names. */
const ARCO_BISHOPS_CHAPTERS: Readonly<Record<string, string | undefined>> = {
  Introduction: "Bishop's Opening",
  "Black's Responses": "Bishop's Opening",
  'The Berlin Defense: Urusov Gambit': "Bishop's Opening: Urusov Gambit",
  'The Boi Variation: McDonnell Gambit': "Bishop's Opening: McDonnell Gambit",
  'The Boi Variation: McDonnell Double Gambit!?': "Bishop's Opening: McDonnell Gambit",
  'The Boi Variation: Four Pawns Gambit': "Bishop's Opening: Four Pawns Gambit",
};

/**
 * A study's `chapters` and `chapterName` from one map of its chapters: the
 * chapters it lists, named as it says. Unlike `chapterNamed`, a chapter the
 * study gained since is left out, for a study read only for some chapters.
 */
function onlyChapters(names: Readonly<Record<string, string | undefined>>) {
  return {
    chapters: (title: string) => Object.hasOwn(names, title),
    chapterName: (title: string) => names[title],
  };
}

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

/** LBB86's Berlin repertoire for Black: the theory chapters, as variation names, not the practice drills. */
const LBB86_BERLIN_CHAPTERS: Readonly<Record<string, string | undefined>> = {
  // The chapter titles say Nxd5 for 4...Nxe4.
  '4.O-O Nxd5 5.d4': '4.O-O: 5.d4',
  '4.O-O Nxd5 5.Re1': '4.O-O: 5.Re1',
  '4.O-O Nxd5 Qe2': '4.O-O: 5.Qe2',
  '4.d3': 'Anti-Berlin Variation',
  '4.Qe2': '4.Qe2',
  '4.d4': '4.d4',
};

/** Regaele's Berlin endgame for Black, as variation names. */
const REGAELE_BERLIN_CHAPTERS: Readonly<Record<string, string | undefined>> = {
  'Introduction - Berlin Defence': '4.O-O: 5.d4',
  '9. Rd1': '4.O-O: 5.d4',
  '9. h3': '4.O-O: 5.d4',
  '9. Nf3': '4.O-O: 5.d4',
  // 9.Nc3 Bd7 and 9.Ng5, from the endgame's starting position.
  'Capitolo 6': '4.O-O: 5.d4',
  Ng5: '4.O-O: 5.d4',
  'Capitolo 9': '4.O-O: 5.d4',
  'An alternative to the Berlin Endgame 4. d3': 'Anti-Berlin Variation',
};

/** hb2007's Berlin for Black, by White's fourth move. */
const HB2007_BERLIN_CHAPTERS: Readonly<Record<string, string | undefined>> = {
  'THE BERLIN DEFENSE': undefined,
  '4. O-O (Rio Gambit)': '4.O-O',
  '4. d3': 'Anti-Berlin Variation',
  '4. Qe2': '4.Qe2',
  '4. Nc3 (Transpose to Four Knights)': 'Four Knights',
  '4. d4': '4.d4',
  '4. Bxc6 and 5. O-O': '4.Bxc6',
};

/**
 * NapalmA's Berlin chapters for Black, as variation names. Left out: Black's other fourth moves
 * (the Beverwijk, the Rosenthal, the Fishing Pole), which the lesson doesn't play.
 */
const NAPALMA_BERLIN_CHAPTERS: Readonly<Record<string, string | undefined>> = {
  'BD - Rio Gambit Accepted': '4.O-O: 5.Re1',
  'BD - Rio Gambit Accepted - Line2': '4.O-O: 5.Re1',
  "BD - l'Hermet Variation - Berlin Wall Defense": '4.O-O: 5.d4',
  'BD - Scotch Invitation': '4.d4',
  'BD - 4...Bxc6!?': '4.Bxc6',
  'BD - Knight Sacrifice Line': 'Anti-Berlin Variation',
  'Four Knight Game - Spanish Variation': 'Four Knights',
};

/** Coldfield1994's Berlin for White, one position a chapter, as variation names. */
const COLDFIELD_BERLIN_CHAPTERS: Readonly<Record<string, string | undefined>> = {
  'Opening Position : Berlin Defense': undefined,
  'Berlin Defense + 4.0-0': undefined,
  'Berlin Defense + 4.0-0 Nxe4 : Rio Gambit Accepted': '4.O-O',
  'Rio Gambit Accepted + 5.d4': '4.O-O: 5.d4',
  "Rio Gambit Accepted + 5.d4 Nd6 : I'Hermet Variation": '4.O-O: 5.d4',
  "I'Hermet Variation + 6.Bxc6 dxc6": '4.O-O: 5.d4',
};

/** Eric Rosen's Stafford Gambit traps, named by White's fifth and sixth moves. */
const STAFFORD_CHAPTERS: Readonly<Record<string, string | undefined>> = {
  Introduction: undefined,
  'Oh no my queen!': '5.d3: 6.Bg5',
  'Oh no my knight!': '5.e5: 6.d3',
  "Take my knight, but I'll take your rook...": '5.e5: 6.d4',
  'Most common trap': '5.Nc3: 6.d3',
  'Punishing Natural Development': '5.Nc3: 6.Bc4',
  'My Favorite Trap (Sometimes works against GMs!)': '5.Nc3: 6.Be2',
  "Drag white's king to e4 (before move 10!)": '5.d3: 6.h3',
  'Everyone falls for this trap 😁': '5.d3: 6.Be2',
  'Miscellaneous Lines': '5.d3: 6.Be3',
};

/** Eric Rosen's Lucchini Gambit, by White's fifth move. */
const LUCCHINI_CHAPTERS: Readonly<Record<string, string | undefined>> = {
  'Lucchini Gambit - 5.Ng5 Trap': '5.Ng5',
  'Lucchini Gambit - 5.exf5?!': '5.exf5',
  'Lucchini Gambit - 5.0-0': '5.O-O',
  '5.Bxg8': '5.Bxg8',
};

/** Eric Rosen's Boden-Kieseritzky Gambit, by Black's fourth and fifth moves. */
const BODEN_CHAPTERS: Readonly<Record<string, string | undefined>> = {
  'Introduction to the Boden-Kieseritzky Gambit': undefined,
  'How to get a crushing position in less than 10 moves': '5...Nc6',
  'The best try for black: 5...f6!?': '5...f6',
  'Other move 4 responses for black': '4...Nf6',
};

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
  'Najdorf Sicilian Opočenský Theory': 'Najdorf Variation: 6.Be2',
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

/** andrew_tsiri's theory chapters, as variation names; the group chapters name none of their own. */
const TSIRI_CHAPTERS: Readonly<Record<string, string | undefined>> = {
  Introduction: undefined,
  'Open Sicilian': undefined,
  '--- Modern Variations': undefined,
  '------ Najdorf Variation': 'Najdorf Variation',
  '------ Dragon Variation': 'Dragon Variation',
  '------ Classical Variation': 'Classical Variation',
  '------ Scheveningen Variation': 'Scheveningen Variation',
  '--- Old Sicilian': undefined,
  '------ Sveshnikov Variation': 'Sveshnikov Variation',
  '------ Accelerated Dragon': 'Accelerated Dragon',
  '------ Kalashnikov Variation': 'Kalashnikov Variation',
  '--- French Variation': undefined,
  '------ Taimanov Variation': 'Taimanov Variation',
  '------ Kan Variation': 'Kan Variation',
  '------ Four Knights Variation': 'Four Knights Variation',
  '------ Pin Variation': 'Pin Variation',
  "White's third move alternatives": undefined,
  '--- Moscow Variation': 'Moscow Variation',
  '--- Rossolimo Variation': 'Rossolimo Attack',
  "Black's second move alternatives": undefined,
  '--- Hyper-Accelerated Dragon': 'Hyper-Accelerated Dragon',
  "--- O'Kelly Variation": "O'Kelly Variation",
  '--- Nimzowitsch-Rubinstein Variation': 'Nimzowitsch Variation',
  'Closed Sicilian': 'Closed Sicilian',
  "White's second move alternatives": undefined,
  '--- Alapin Variation': 'Alapin Variation',
  // 2.f4, which the main study calls the McDonnell Attack.
  '--- Grand Prix Attack': 'McDonnell Attack',
  '--- Smith-Morra Gambit': 'Smith-Morra Gambit',
};

/**
 * LeninPerez's theory chapters, as variation names. Not the Berlin: it is set
 * up after 3...Nf6, which none of its earlier chapters reach, so it can't join their line.
 */
const LENIN_RUY_CHAPTERS: Readonly<Record<string, string | undefined>> = {
  Introduction: undefined,
  'Morphy Defense Closed': 'Closed Ruy Lopez',
  'Morphy Defense Open': 'Open Ruy Lopez',
  'Marshall Attack': 'Closed Ruy Lopez: Marshall Attack',
  'Steinitz Defense': 'Steinitz Defence',
  'Classical Variation': 'Classical Defence',
  'Schliemann Defense': 'Schliemann Defence',
  'Cozio Defense': 'Cozio Defence',
  'Fianchetto Defense': 'Fianchetto Defence',
};

/** loloriv's King's Indian chapters, as variation names. */
const LOLORIV_KID_CHAPTERS: Readonly<Record<string, string | undefined>> = {
  "King's Indian Defense Introduction": undefined,
  'Classical (Orthodox) Theory': 'Orthodox Variation',
  'Bayonet Attack Theory': 'Orthodox Variation: Bayonet Attack',
  'Sämisch Variation Theory': 'Sämisch Variation',
  "King's Indian Defense vs. London System Theory": 'London System',
};

/** LeninPerez's King's Indian chapters, as variation names. */
const LENIN_KID_CHAPTERS: Readonly<Record<string, string | undefined>> = {
  Introduction: undefined,
  'Classic Variation 1 (O-O)': 'Orthodox Variation',
  // 7.d5, which the explorer names the Petrosian Variation.
  'Classic Variation 2 (Advance d5)': 'Orthodox Variation: Petrosian Variation',
  // 6.Be3, the Larsen Variation.
  'Classic Variation 3 (Larsen of the advance)': 'Larsen Variation',
  'Variation Classic 4 (Larsen dxe5)': 'Larsen Variation',
  'Variante Sämisch 1 (Ce2)': 'Sämisch Variation',
  'Sämisch Variation 2 (Advance d5)': 'Sämisch Variation',
  'Sämisch Variation 3 (dxc5)': 'Sämisch Variation',
  'Sämisch Variation 4 (Bg5)': 'Sämisch Variation',
  "King's Indian vs London System 1": 'London System',
  "King's Indian vs London System 2": 'London System',
};

/** heyucatchthis's King's Indian chapters, as variation names; its review repeats the others. */
const HEYU_KID_CHAPTERS: Readonly<Record<string, string | undefined>> = {
  'The KID🔥': undefined,
  'KID: Orthodox variation🛡️': 'Orthodox Variation',
  'KID: Samisch Variation⚡': 'Sämisch Variation',
  'KID: 4 pawns attack!': 'Four Pawns Attack',
  'KID: Fianchetto System': 'Fianchetto Variation',
  'KID: Averbakh Variation🏹': 'Averbakh Variation',
};

/** Bosburp's King's Indian traps, by the variation each is set in; unnamed ones are 5.Nf3 sidelines. */
const KID_TRAP_CHAPTERS: Readonly<Record<string, string | undefined>> = {
  'Trap 1: Beautiful knight "sac"': undefined,
  'Trap 2: get a nice position!': 'Four Pawns Attack',
  'Trap 3: Trap in the Averbakh variation': 'Averbakh Variation',
  'Trap 4: trap in the Samisch variation': 'Sämisch Variation',
  'Trap 5: win the queen!': 'London System',
  'Trap 6: win the knight!': 'Orthodox Variation',
  'Trap 7: win the knight (again)': undefined,
  'Trap 8: win the knight or get a good position': undefined,
  'Trap 9: win the rook!': undefined,
  'Trap 10: win the rook (again)': 'Sämisch Variation',
};

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
        ...onlyChapters(WUB_CARO_KANN),
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
        ...onlyChapters(KITSUNE_CHAPTERS),
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
        ...onlyChapters(WUB_SLAV),
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
        ...onlyChapters(WURZELKRAFT_CHAPTERS),
      },
      {
        // 3.c5, which no guide covers: 3...e5 against each of White's common replies.
        ...committedPgn('slav-3-c5.pgn', { title: 'Punishing 3.c5', author: 'Opening Night' }),
        chapters: () => true,
        chapterName: () => '3.c5',
        namedFrom: 5,
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
        ...onlyChapters(DAVID_LONDON_CHAPTERS),
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
        ...onlyChapters(DAVID_ANTI_LONDON_CHAPTERS),
      },
    ],
    engineCheck: true,
    info: {
      id: 'anti-london',
      title: 'Anti-London',
      side: 'black',
    },
  },
  'open-game': {
    from: [
      {
        // Fischer's own analysis of 3...d6, his "bust" of the King's Gambit, and a modern line.
        study: 'UIQySNsb',
        credit: {
          title: "King's Gambit Accepted: Fischer Defense",
          author: 'nohandlebars',
          url: 'https://lichess.org/study/UIQySNsb',
        },
        // The theory chapters, not the example game.
        ...onlyChapters(FISCHER_CHAPTERS),
        namedFrom: 3,
      },
      {
        // White's view of the Fischer Defense, reworded for Black; its introductions lead to it.
        study: 'ACmyH8gC',
        credit: {
          title: "King's Gambit | Full Repertoire",
          author: 'Bosburp',
          url: 'https://lichess.org/study/ACmyH8gC',
        },
        writtenFor: 'white',
        ...onlyChapters(BOSBURP_KG_CHAPTERS),
        namedFrom: 3,
      },
      // The rest of the King's Gambit Accepted: 3.Bc4, 3.Nc3 and the rest.
      {
        root: 'Chess_Opening_Theory/1._e4/1...e5/2._f4/2...exf4',
        topName: "King's Gambit",
        maxPages: 40,
      },
      // 2...Nc6 3.Bc4 g6 4.Qf3 Nf6 and ...Bg7: the fianchetto answer to the early queen.
      { root: 'Chess_Opening_Theory/1._e4/1...e5/2._Qh5', topName: 'Wayward Queen Attack' },
      { root: 'Chess_Opening_Theory/1._e4/1...e5/2._Qf3', topName: 'Wayward Queen Attack: 2.Qf3' },
      // The mirror: ...Bc5 against White's Bc4, and early ...Bc5 elsewhere.
      {
        root: 'Chess_Opening_Theory/1._e4/1...e5/2._Nf3/2...Nc6/3._Bc4/3...Bc5',
        topName: 'Italian: Giuoco Piano',
        maxPages: 60,
      },
      {
        // White's Italian, reworded for Black. Named from 4.b4: its Evans Gambit chapter starts
        // after 3...Bc5, and the Wikibooks root above names the Giuoco Piano.
        ...LENIN_ITALIAN,
        writtenFor: 'white',
        ...onlyChapters(LENIN_ITALIAN_CHAPTERS),
        namedFrom: 7,
      },
      {
        // The Evans Gambit (4.b4), White's view, reworded for Black.
        ...KITSUNE_EVANS,
        writtenFor: 'white',
        // The theory chapters, not the master game.
        chapters: (title: string) => title !== 'Garry Kasparov vs Viswanathan Anand 1995',
        chapterName: () => 'Italian: Giuoco Piano: Evans Gambit',
        namedFrom: 7,
      },
      {
        root: 'Chess_Opening_Theory/1._e4/1...e5/2._Nf3/2...Nc6/3._Bb5/3...Bc5',
        topName: 'Ruy Lopez: Classical Defence',
        maxPages: 40,
      },
      {
        root: 'Chess_Opening_Theory/1._e4/1...e5/2._Nf3/2...Nc6/3._d4/3...exd4/4._Nxd4/4...Bc5',
        topName: 'Scotch: Classical',
        maxPages: 40,
      },
      {
        root: 'Chess_Opening_Theory/1._e4/1...e5/2._Nf3/2...Nc6/3._Nc3/3...Bc5',
        topName: 'Three Knights',
        maxPages: 20,
      },
      {
        root: 'Chess_Opening_Theory/1._e4/1...e5/2._Nf3/2...Nc6/3._c3',
        topName: 'Ponziani',
        maxPages: 30,
      },
      {
        root: 'Chess_Opening_Theory/1._e4/1...e5/2._Bc4/2...Bc5',
        topName: "Bishop's Opening",
        maxPages: 40,
      },
      { root: 'Chess_Opening_Theory/1._e4/1...e5/2._Nc3/2...Bc5', topName: 'Vienna', maxPages: 30 },
      {
        root: 'Chess_Opening_Theory/1._e4/1...e5/2._d4/2...exd4',
        topName: 'Centre Game',
        maxPages: 30,
      },
    ],
    engineCheck: true,
    info: {
      id: 'open-game',
      title: 'Open Game: Bowdler Mirror',
      side: 'black',
    },
  },
  albin: {
    from: [
      {
        root: 'Chess_Opening_Theory/1._d4/1...d5/2._c4/2...e5',
        topName: 'Albin Countergambit',
        maxPages: 60,
      },
      {
        // White's view of the Albin, reworded for Black; its introduction leads to it.
        ...BOSBURP_QG,
        writtenFor: 'white',
        chapters: (title: string) =>
          title === QG_INTRO || QG_CHAPTERS[title] === 'Albin Countergambit',
        chapterName: (title: string) => QG_CHAPTERS[title],
        namedFrom: 3,
      },
      {
        // The London mirror: White's London against ...Bf5, whose main line plays Black's
        // mirror (2...Bf5 3.e3 e6 4.Bd3 Bxd3): booked, its comments reworded for Black.
        study: '2EaSmZtz',
        credit: {
          title: 'London System Repertoire',
          author: 'davidharoldchess',
          url: 'https://lichess.org/study/2EaSmZtz',
        },
        writtenFor: 'white',
        recommends: true,
        chapters: (title: string) => title === 'London System vs Bf5',
        chapterName: () => 'London Mirror',
        namedFrom: 3,
      },
      {
        // More of what White plans against an early ...Bf5, reworded for Black; books none.
        study: '0jynK1KI',
        credit: {
          title: 'The London System',
          author: 'AverageLondonEnjoyer',
          url: 'https://lichess.org/study/0jynK1KI',
        },
        writtenFor: 'white',
        chapters: (title: string) => title === 'London vs. Early Bf5',
        chapterName: () => 'London Mirror',
        namedFrom: 3,
      },
      { root: 'Chess_Opening_Theory/1._d4/1...d5/2._Nf3', topName: '2.Nf3', maxPages: 40 },
      { root: 'Chess_Opening_Theory/1._d4/1...d5/2._Nc3', topName: '2.Nc3', maxPages: 30 },
    ],
    engineCheck: true,
    info: {
      id: 'albin',
      title: 'Albin Countergambit & London Mirror',
      side: 'black',
    },
  },
  'bc4-system': {
    from: [
      {
        // Nathaniel's setup: a3 and Ba2, d3, Ne2, castle, Nbc3, Ng3, then f4.
        ...committedPgn('bowdler-setup.pgn', { title: 'Bowdler Attack setup', author: 'ntucker' }),
        chapters: () => true,
        chapterName: () => 'Bowdler Attack',
        namedFrom: 3,
      },
      {
        root: 'Chess_Opening_Theory/1._e4/1...e5/2._Bc4',
        topName: "Bishop's Opening",
        rename: { "Bishop's Opening Classical Defence": 'Classical Defence' },
        maxPages: 60,
      },
      {
        study: 'G14vzkiG',
        credit: {
          title: "The Bishop's Opening",
          author: 'Arco47',
          url: 'https://lichess.org/study/G14vzkiG',
        },
        chapters: () => true,
        chapterName: (title: string) =>
          chapterNamed(ARCO_BISHOPS_CHAPTERS, "Bishop's Opening", title),
        namedFrom: 3,
      },
      {
        root: 'Chess_Opening_Theory/1._e4/1...c6/2._Bc4',
        topName: 'Hillbilly Attack',
        maxPages: 30,
      },
      {
        // Black's view of 2.Bc4 against the Caro-Kann, reworded for White.
        study: '2wkHsejC',
        credit: {
          title: 'Caro-Kann Defense, Hillbilly Attack',
          author: 'Kitsune_Cavalry',
          url: 'https://lichess.org/study/2wkHsejC',
        },
        writtenFor: 'black',
        // The theory chapters, not the example games.
        chapters: (title: string) => !title.includes(' -- '),
        chapterName: () => 'Hillbilly Attack',
        namedFrom: 3,
      },
      {
        // Black's view of 2.Bc4 against the Caro-Kann, reworded for White.
        ...WUB_C6,
        writtenFor: 'black',
        chapters: (title: string) =>
          title === 'e4 – The Caro-Kann' ||
          title === 'Other Second Moves – 2. Bc4 – The Hillbilly Attack',
        chapterName: (title: string) =>
          title === 'e4 – The Caro-Kann' ? undefined : 'Hillbilly Attack',
      },
      { root: 'Chess_Opening_Theory/1._e4/1...e6/2._Bc4', topName: 'French: 2.Bc4', maxPages: 20 },
      {
        // The Scandinavian's main line, where White's bishop comes to c4: Black's view, reworded for White.
        study: 'gzj623hW',
        credit: {
          title: 'The scandinavian defense',
          author: 'purple_royal',
          url: 'https://lichess.org/study/gzj623hW',
        },
        writtenFor: 'black',
        chapters: (title: string) =>
          title === 'Mainline scandinavian' || title === 'Mainline in depth',
        chapterName: () => 'Scandinavian',
        namedFrom: 2,
      },
    ],
    engineCheck: true,
    info: {
      id: 'bc4-system',
      title: "Bishop's System (Bowdler)",
      side: 'white',
    },
  },
  sicilian: {
    from: [
      {
        ...LOLORIV_SICILIAN,
        // Black's theory chapters; the reviews replay them as quizzes or master games.
        ...onlyChapters(SICILIAN_CHAPTERS),
      },
      {
        // The chapters showing White's setups, reworded for Black: they book none of Black's moves.
        ...LOLORIV_SICILIAN,
        writtenFor: 'white',
        ...onlyChapters(SICILIAN_WHITE_CHAPTERS),
      },
      {
        study: 'tbNutvBV',
        credit: {
          title: 'Sicilian Defense: All you need to know',
          author: 'andrew_tsiri',
          url: 'https://lichess.org/study/tbNutvBV',
        },
        // Short chapters on nearly every line, chained by FEN: the Moscow, Kan and 2...g6 lines.
        ...onlyChapters(TSIRI_CHAPTERS),
      },
      {
        root: 'Chess_Opening_Theory/1._e4/1...c5',
        rename: {
          // Pages grouping White's 3.d4 by Black's second move, which the main study names by system.
          'Open Sicilian with ...d6': '',
          'Open Sicilian with ...Nc6': '',
          'Open Sicilian with 2...e6': '',
          'French Sicilian': '',
          'Smith-Morra gambit accepted': '',
          '3...d6': '',
          'Classical Sicilian': 'Classical Variation',
          'Hyperaccelerated Dragon': 'Hyper-Accelerated Dragon',
          'Kan Sicilian': 'Kan Variation',
        },
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
        ...onlyChapters(RUY_CHAPTERS),
      },
      {
        // The Berlin, shown from Black's side, reworded for White: it books none of White's moves.
        ...LOLORIV_RUY,
        writtenFor: 'black',
        chapters: (title: string) => title === 'Berlin Defense Theory',
        chapterName: () => 'Berlin Defence',
      },
      {
        study: 'ZkCxh0nB',
        credit: {
          title: 'Ruy Lopez',
          author: 'LeninPerez',
          url: 'https://lichess.org/study/ZkCxh0nB',
        },
        // Black's third moves the main study skips: the Steinitz, Classical, Schliemann and Cozio.
        ...onlyChapters(LENIN_RUY_CHAPTERS),
      },
      {
        root: 'Chess_Opening_Theory/1._e4/1...e5/2._Nf3/2...Nc6/3._Bb5',
        rename: {
          // 3...a6, under which the main study names its own variations.
          'Morphy defence': '',
          'Closed Spanish': 'Closed Ruy Lopez',
          'Open Spanish': 'Open Ruy Lopez',
          'Jaenisch gambit': 'Schliemann Defence',
        },
      },
    ],
    engineCheck: true,
    info: {
      id: 'ruy-lopez',
      title: 'Ruy Lopez',
      side: 'white',
    },
  },
  french: {
    from: [
      {
        study: 'cpULfWpl',
        credit: {
          title: 'French Defence - Complete Repertoire',
          author: 'RadiantSmrf',
          url: 'https://lichess.org/study/cpULfWpl',
        },
        chapters: () => true,
        chapterName: (title: string) =>
          chapterNamed(RADIANT_FRENCH_CHAPTERS, 'RadiantSmrf French', title),
      },
      {
        study: 'bgAmUOck',
        credit: {
          title: 'Black repertoaire: French defense',
          author: 'MMatkun',
          url: 'https://lichess.org/study/bgAmUOck',
        },
        chapters: () => true,
        chapterName: (title: string) =>
          chapterNamed(MMATKUN_FRENCH_CHAPTERS, 'MMatkun French', title),
      },
      // Wikibooks fills White's second moves the studies skip, one root per move so the page budget
      // isn't spent deep in the first one.
      {
        root: 'Chess_Opening_Theory/1._e4/1...e6/2._Nf3',
        rename: { 'Wing gambit': 'Knight Variation: Wing Gambit' },
        maxPages: 12,
      },
      { root: 'Chess_Opening_Theory/1._e4/1...e6/2._Bc4' },
      { root: 'Chess_Opening_Theory/1._e4/1...e6/2._e5' },
      { root: 'Chess_Opening_Theory/1._e4/1...e6/2._Nc3', maxPages: 10 },
      { root: 'Chess_Opening_Theory/1._e4/1...e6/2._d3', topName: "King's Indian Attack" },
      {
        root: 'Chess_Opening_Theory/1._e4/1...e6/2._d4/2...d5/3._exd5',
        topName: 'Exchange Variation',
      },
    ],
    engineCheck: true,
    info: { id: 'french', title: 'French Defence', side: 'black' },
  },
  'anti-sicilian': {
    from: [
      {
        study: '55CPbtmd',
        credit: {
          title: 'CRUSH the Sicilian! 2...Nc6',
          author: 'Bosburp',
          url: 'https://lichess.org/study/55CPbtmd',
        },
        // The theory chapters; the sidelines heading, thanks, community and outro teach nothing.
        chapters: (title: string) =>
          !/Section 4: Sidelines|Special Thanks|Community|Outro/.test(title),
        chapterName: (title: string) => chapterNamed(PORTSMOUTH_CHAPTERS, 'Portsmouth', title),
      },
      {
        study: 'Vpb6r3Wq',
        credit: {
          title: 'CRUSH the Sicilian! 2...d6',
          author: 'Bosburp',
          url: 'https://lichess.org/study/Vpb6r3Wq',
        },
        chapters: (title: string) => !/Community|Outro/.test(title),
        chapterName: (title: string) => chapterNamed(SICILIAN_BC4_CHAPTERS, '3.Bc4', title),
      },
    ],
    engineCheck: true,
    info: { id: 'anti-sicilian', title: 'Anti-Sicilian', side: 'white' },
  },
  italian: {
    from: [
      {
        ...LENIN_ITALIAN,
        ...onlyChapters(ITALIAN_CHAPTERS),
      },
      {
        ...KITSUNE_EVANS,
        ...onlyChapters(EVANS_CHAPTERS),
      },
      {
        study: 'UmI4upXD',
        credit: {
          title: 'Italian Game; Two Knights Defense, Knight Attack',
          author: 'Kitsune_Cavalry',
          url: 'https://lichess.org/study/UmI4upXD',
        },
        chapters: () => true,
        chapterName: (title: string) =>
          chapterNamed(KNIGHT_ATTACK_CHAPTERS, 'Knight Attack', title),
      },
      // Wikibooks fills Black's third moves, one root per move so the page budget isn't spent deep
      // in the first one.
      {
        root: 'Chess_Opening_Theory/1._e4/1...e5/2._Nf3/2...Nc6/3._Bc4/3...Bc5',
        topName: 'Giuoco Piano',
        maxPages: 15,
      },
      {
        root: 'Chess_Opening_Theory/1._e4/1...e5/2._Nf3/2...Nc6/3._Bc4/3...Nf6',
        topName: 'Two Knights Defence',
        maxPages: 15,
      },
      {
        root: 'Chess_Opening_Theory/1._e4/1...e5/2._Nf3/2...Nc6/3._Bc4/3...Be7',
        topName: 'Hungarian Defence',
      },
      {
        root: 'Chess_Opening_Theory/1._e4/1...e5/2._Nf3/2...Nc6/3._Bc4/3...d6',
        topName: 'Paris Defence',
      },
      {
        root: 'Chess_Opening_Theory/1._e4/1...e5/2._Nf3/2...Nc6/3._Bc4/3...Nd4',
        topName: 'Blackburne Shilling Gambit',
      },
      {
        root: 'Chess_Opening_Theory/1._e4/1...e5/2._Nf3/2...Nc6/3._Bc4/3...h6',
        topName: 'Anti-Fried Liver Defence',
        // The page says White strikes with 4.d4 but plays no move.
        replies: { 'e4 e5 Nf3 Nc6 Bc4 h6': 'd4' },
      },
      {
        root: 'Chess_Opening_Theory/1._e4/1...e5/2._Nf3/2...Nc6/3._Bc4/3...f5',
        topName: 'Rousseau Gambit',
      },
    ],
    engineCheck: true,
    info: { id: 'italian', title: 'Italian Game', side: 'white' },
  },
  'kings-indian': {
    from: [
      {
        study: '6KDwzqUU',
        credit: {
          title: "King's Indian Complete Study Guide",
          author: 'loloriv',
          url: 'https://lichess.org/study/6KDwzqUU',
        },
        // The theory chapters; the two Bayonet reviews replay the main line as whole games.
        ...onlyChapters(LOLORIV_KID_CHAPTERS),
      },
      {
        study: 'Ks4C5dXu',
        credit: {
          title: "King's Indian Defense",
          author: 'LeninPerez',
          url: 'https://lichess.org/study/Ks4C5dXu',
        },
        ...onlyChapters(LENIN_KID_CHAPTERS),
      },
      {
        study: '4HN6lhFd',
        credit: {
          title: "The King's Indian Defense",
          author: 'heyucatchthis',
          url: 'https://lichess.org/study/4HN6lhFd',
        },
        ...onlyChapters(HEYU_KID_CHAPTERS),
      },
      {
        // White's traps against the King's Indian, reworded for Black.
        study: '179Uvn8y',
        credit: {
          title: "10 TRAPS in the King's Indian Defense (KID)",
          author: 'Bosburp',
          url: 'https://lichess.org/study/179Uvn8y',
        },
        writtenFor: 'white',
        ...onlyChapters(KID_TRAP_CHAPTERS),
      },
      // Wikibooks fills White's moves the studies skip. Its King's Indian pages are short, so each
      // root is one move.
      {
        root: 'Chess_Opening_Theory/1._d4/1...Nf6/2._c4/2...g6/3._Nc3/3...Bg7/4._e4/4...d6/5._f4',
        topName: 'Four Pawns Attack',
      },
      {
        root: 'Chess_Opening_Theory/1._d4/1...Nf6/2._c4/2...g6/3._Nc3/3...Bg7/4._e4/4...d6/5._f3',
        topName: 'Sämisch Variation',
      },
      { root: 'Chess_Opening_Theory/1._d4/1...Nf6/2._c4/2...g6/3._Nc3/3...Bg7/4._Nf3' },
      { root: 'Chess_Opening_Theory/1._d4/1...Nf6/2._c4/2...g6/3._Nf3' },
      { root: 'Chess_Opening_Theory/1._d4/1...Nf6/2._Nf3/2...g6' },
      { root: 'Chess_Opening_Theory/1._d4/1...Nf6/2._Bg5' },
      { root: 'Chess_Opening_Theory/1._d4/1...Nf6/2._Bf4', topName: 'London System' },
    ],
    engineCheck: true,
    info: { id: 'kings-indian', title: "King's Indian Defence", side: 'black' },
  },
  'queens-gambit': {
    from: [
      {
        ...BOSBURP_QG,
        // White's repertoire; the outro only says goodbye.
        ...onlyChapters(QG_CHAPTERS),
      },
      // Wikibooks fills the replies the study leaves open, one root per reply so the page budget
      // isn't spent deep in the first one.
      {
        root: 'Chess_Opening_Theory/1._d4/1...d5/2._c4/2...dxc4',
        topName: "Queen's Gambit Accepted",
        rename: {
          'Classical variation': 'Classical Defence',
          'Classical Variation': 'Classical Defence',
        },
        maxPages: 20,
      },
      {
        root: 'Chess_Opening_Theory/1._d4/1...d5/2._c4/2...e6',
        topName: "Queen's Gambit Declined",
        maxPages: 20,
      },
      {
        root: 'Chess_Opening_Theory/1._d4/1...d5/2._c4/2...c6',
        topName: 'Slav Defence',
        // Steps on the way to the Czech Variation, which the study names already.
        rename: {
          'Modern Line': '',
          'Slav accepted': '',
          'Alapin variation': '',
          'Alapin Variation': '',
          'Central variation': '',
          'Central Variation': '',
        },
        maxPages: 6,
      },
      { root: 'Chess_Opening_Theory/1._d4/1...d5/2._c4/2...Nf6', topName: 'Marshall Defence' },
      { root: 'Chess_Opening_Theory/1._d4/1...d5/2._c4/2...Bf5', topName: 'Baltic Defence' },
      {
        root: 'Chess_Opening_Theory/1._d4/1...d5/2._c4/2...Nc6',
        topName: 'Chigorin Defence',
        maxPages: 15,
      },
      { root: 'Chess_Opening_Theory/1._d4/1...d5/2._c4/2...c5', topName: 'Austrian Defence' },
    ],
    engineCheck: true,
    info: {
      id: 'queens-gambit',
      title: "Queen's Gambit",
      side: 'white',
    },
  },
  stafford: {
    from: [
      {
        study: 'whCVdUeM',
        credit: {
          title: 'Stafford Gambit Traps',
          author: 'EricRosen',
          url: 'https://lichess.org/study/whCVdUeM',
        },
        chapters: () => true,
        chapterName: (title: string) => chapterNamed(STAFFORD_CHAPTERS, 'Stafford Gambit', title),
      },
    ],
    engineCheck: 'gambit',
    info: { id: 'stafford', title: 'Stafford Gambit', side: 'black' },
  },
  lucchini: {
    from: [
      {
        study: 'WsJcW3Z5',
        credit: {
          title: 'Lucchini gambit',
          author: 'EricRosen',
          url: 'https://lichess.org/study/WsJcW3Z5',
        },
        chapters: () => true,
        chapterName: (title: string) => chapterNamed(LUCCHINI_CHAPTERS, 'Lucchini Gambit', title),
        // A stray 1.h3 with no moves after it.
        leave: ['h3'],
      },
    ],
    engineCheck: 'gambit',
    info: { id: 'lucchini', title: 'Lucchini Gambit', side: 'black' },
  },
  'boden-kieseritzky': {
    from: [
      {
        study: 'XaGhm8Vt',
        credit: {
          title: 'Boden - Kieseritzky Gambit',
          author: 'EricRosen',
          url: 'https://lichess.org/study/XaGhm8Vt',
        },
        chapters: () => true,
        chapterName: (title: string) =>
          chapterNamed(BODEN_CHAPTERS, 'Boden-Kieseritzky Gambit', title),
      },
    ],
    engineCheck: 'gambit',
    info: { id: 'boden-kieseritzky', title: 'Boden-Kieseritzky Gambit', side: 'white' },
  },
  berlin: {
    from: [
      {
        study: 'dV73Jv0R',
        credit: {
          title: 'Black Repertoire - Ruy Lopez: Berlin Defense',
          author: 'LBB86',
          url: 'https://lichess.org/study/dV73Jv0R',
        },
        ...onlyChapters(LBB86_BERLIN_CHAPTERS),
      },
      {
        // loloriv's Berlin chapter, written for Black; the rest of the study is White's Ruy Lopez.
        // After LBB86's, whose chapters each name one of White's fourth moves: a chapter of all of
        // them first would name every shared position for its main line.
        ...LOLORIV_RUY,
        chapters: (title: string) => title === 'Berlin Defense Theory',
        chapterName: () => undefined,
      },
      {
        study: 'fpOrtRTd',
        credit: {
          title: 'Berlin Endgame',
          author: 'Regaele',
          url: 'https://lichess.org/study/fpOrtRTd',
        },
        ...onlyChapters(REGAELE_BERLIN_CHAPTERS),
      },
      {
        study: 'VtuJiz4I',
        credit: {
          title: 'The Berlin Defense',
          author: 'hb2007',
          url: 'https://lichess.org/study/VtuJiz4I',
        },
        ...onlyChapters(HB2007_BERLIN_CHAPTERS),
      },
      {
        // Deep lines for Black with few words: what the annotated studies stop short of.
        study: 'Re4v85P5',
        credit: {
          title: 'Ruy Lopez',
          author: 'NapalmA',
          url: 'https://lichess.org/study/Re4v85P5',
        },
        ...onlyChapters(NAPALMA_BERLIN_CHAPTERS),
      },
      {
        root: 'Chess_Opening_Theory/1._e4/1...e5/2._Nf3/2...Nc6/3._Bb5/3...Nf6',
        rename: { 'Open Berlin': '4.O-O', 'Anti-Berlin': 'Anti-Berlin Variation' },
        maxPages: 80,
      },
      {
        // White's view, reworded for Black: what each move of the main line is for.
        study: 'NkkkhPkh',
        credit: {
          title: 'Ruy Lopez, Berlin Defense (White)',
          author: 'Coldfield1994',
          url: 'https://lichess.org/study/NkkkhPkh',
        },
        writtenFor: 'white',
        ...onlyChapters(COLDFIELD_BERLIN_CHAPTERS),
      },
      {
        // The Anti-Berlin from White's side, reworded for Black.
        study: 'hjMiyfDf',
        credit: {
          title: 'Pursuing The Anti-Berlin',
          author: 'KusozakoChessMaster',
          url: 'https://lichess.org/study/hjMiyfDf',
        },
        writtenFor: 'white',
        chapters: (title: string) => title === 'Anti-Berlin with d3',
        chapterName: () => 'Anti-Berlin Variation',
      },
      {
        // A GM's analysis of 5.Re1 for White, reworded for Black.
        study: 'b9PURAHh',
        credit: {
          title: 'Attack the Berlin Defense - Full analysis by a GM',
          author: 'JThybo',
          url: 'https://lichess.org/study/b9PURAHh',
        },
        writtenFor: 'white',
        chapters: () => true,
        chapterName: () => '4.O-O: 5.Re1',
      },
    ],
    engineCheck: true,
    info: { id: 'berlin', title: 'Berlin Defence', side: 'black' },
  },
};
