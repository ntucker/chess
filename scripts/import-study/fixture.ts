import { INITIAL_FEN } from 'chessops/fen';

import {
  type Idea,
  LESSON_FORMAT,
  type Lesson,
  type LessonMove,
  type LessonPosition,
} from '@/lesson/lesson';
import { SAMPLE } from '@/lesson/lesson.fixture';

/** Black's lesson from the start position, all in the variation 'test', with `positions`. */
export const testLesson = <I = Idea>(positions: Lesson<I>['positions']): Lesson<I> => ({
  format: LESSON_FORMAT,
  id: 'test',
  title: 'Test',
  side: 'black',
  start: INITIAL_FEN,
  sources: SAMPLE.sources,
  variations: { test: { name: 'Test' } },
  positions,
});

/** A lesson position in the variation 'test'. */
export const at = <I = Idea>(
  moves: LessonMove<I>[],
  notes?: LessonPosition<I>['notes'],
): LessonPosition<I> => ({
  variation: 'test',
  moves,
  ...(notes && { notes }),
});

/** A two-chapter study in the Caro-Kann study's formats (a core chapter, then an extra one), for the importer's tests. */
export const STUDY_PGN = `[Event "🔵 01 Advance Variation: Short Variation (I)"]
[ChapterName "🔵 01 Advance Variation: Short Variation (I)"]

1. e4 { Idea: Against 3.e5, develop with ...Bf5, ...e6 and ...c5.
Main line: 1.e4 c6 2.d4 d5 3.e5 Bf5
Watch out: ...Qb6? loses material on move 4.
Next: chapter two. } 1... c6 2. d4 (2. Nc3 d5 3. d4 dxe4) 2... d5 3. e5 Bf5 { Choice guide: choose this if you want a solid game. Risk level: low. } (3... c5 { The sharper reply. }) 4. Nf3 $14 { You plan ...e6, ...c5 and ...Nc6. } (4. g4 Bd7 { Trap: 5.e6? fxe6 and White is clearly worse. }) 4... e6 (4... Qb6? 5. Nc3 e6) 5. Be2 $10 { After ...Bf5 and ...e6 you are slightly worse. 5...Nd7 6.O-O Ne7 is the plan. } *

[Event "🟢 02 Classical Variation: Capablanca"]
[ChapterName "🟢 02 Classical Variation: Capablanca"]

1. e4 { Extra: only needed if White plays 3.Nc3.
Idea: Take on e4 and develop the bishop.
Main line: 1.e4 c6 2.d4 d5 3.Nc3 dxe4 4.Nxe4 Bf5 } 1... c6 2. d4 d5 3. Nc3 dxe4 4. Nxe4 Bf5 *
`;
