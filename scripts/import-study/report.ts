/** What an import produced, for the person running it to judge. */
import { positionKey } from '@/game/replay';
import type { Lesson, LessonSource } from '@/lesson/lesson';

import type { ChapterNotes } from './extract';
import type { SourceTally } from './merge';
import { chapterMoves, type Chapter } from './study';

export function report(
  lesson: Lesson,
  chapters: readonly Chapter[],
  extracted: readonly ChapterNotes[],
): string {
  const entries = Object.values(lesson.positions);
  const moves = entries.flatMap((entry) => entry.moves);
  const notes = [
    ...entries.flatMap((entry) => entry.notes ?? []),
    ...moves.flatMap((move) => move.notes ?? []),
  ];
  const ideas = tally(notes.flatMap((note) => note.ideas ?? []).map((idea) => idea.type));
  const rejected = tally(
    extracted
      .flatMap((e) => e.rejected)
      .map(({ idea, why }) => `${idea.type}: ${why.replace(/[a-h][1-8]|\d+/g, '#')}`),
  );
  const rows: [string, unknown][] = [
    ['chapters', chapters.length],
    ['positions', entries.length],
    ['moves', moves.length],
    ['book moves', moves.filter((move) => move.book).length],
    ['moves with a risk tag', moves.filter((move) => move.risk).length],
    ['moves with popularity', moves.filter((move) => move.games).length],
    ['notes', notes.length],
    ['notes without ideas (text only)', notes.filter((note) => !note.ideas).length],
    ['ideas', ideas],
    ['ideas the checker refused', rejected],
    [
      'evaluation glyphs dropped for contradicting the text',
      extracted.reduce((sum, e) => sum + e.contradicted, 0),
    ],
    [
      'moves only in comment text (traps and sequences)',
      moves.length -
        new Set(
          chapters.flatMap((c) =>
            [...chapterMoves(c)].map((m) => `${positionKey(m.before)} ${m.uci}`),
          ),
        ).size,
    ],
  ];
  return rows
    .map(
      ([name, value]) =>
        `${name}: ${typeof value === 'object' ? JSON.stringify(value, null, 1) : value}`,
    )
    .join('\n');
}

/**
 * What each source gave, in priority order, and what earlier ones kept out,
 * with a warning for a source that gave nothing.
 */
export function sourceReport(
  sources: readonly LessonSource[],
  tallies: readonly (SourceTally | undefined)[],
): string {
  return sources
    .map(({ title }, i) => {
      const tally = tallies[i];
      if (!tally || tally.booked + tally.notes === 0)
        return `WARNING: ${title} gave no book moves and no notes`;
      return `${title}: ${tally.booked} book moves, ${tally.notes} notes; left out ${tally.blocked.size} moves an earlier source recommends against and ${tally.notesSkipped} notes where an earlier source explained the spot`;
    })
    .join('\n');
}

function tally(values: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([, a], [, b]) => b - a));
}
