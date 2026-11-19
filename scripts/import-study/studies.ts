/** The lichess studies the app ships as lessons, by lesson id. */
import type { LessonInfo } from './merge';

export const STUDIES = {
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
} satisfies Record<string, { study: string; chapters: (title: string) => boolean; info: LessonInfo }>;
