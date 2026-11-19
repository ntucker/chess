/**
 * The AI step: Sonnet rewrites every comment as short notes for the learner
 * and adds what the fixed formats missed as ideas the board draws. The
 * checker drops every idea that is false in its position; a comment whose
 * ideas were all dropped is asked again of Opus, and the answer keeping more
 * ideas wins. A comment with no answer keeps the notes `extractChapter` made.
 *
 * Runs only when someone imports a study on purpose (`yarn import-study`):
 * the lesson file it writes is committed, so the site build and the tests
 * never call a model.
 */
import { reviewKind, type ReviewKind } from '@/components/dev/review';
import { positionKey } from '@/game/replay';
import type { Note } from '@/lesson/lesson';

import type { ChapterNotes, MoveNote, PositionNote } from '../extract';
import type { Answer, AnswerIdea } from './answer';
import { MODELS, type Ask } from './claude';
import { noteComment, type Comment } from './comments';
import { convertedNotes, type Converted } from './notes';

export interface ConvertReport {
  readonly comments: number;
  readonly unconverted: number;
  readonly retried: number;
  /** Ideas the model wrote that the lesson keeps. */
  readonly kept: number;
  /** What each comment ends up showing: something drawn, only an evaluation badge, or text alone. */
  readonly shows: Readonly<Record<ReviewKind, number>>;
  readonly rejected: readonly { readonly idea: AnswerIdea; readonly why: string }[];
}

/** `extracted` with every commented move's notes rewritten by the model. */
export async function convertChapters(
  extracted: readonly ChapterNotes[],
  ask: Ask,
): Promise<{ extracted: ChapterNotes[]; report: ConvertReport }> {
  const jobs = extracted.map((chapter) =>
    chapter.moveNotes.map((moveNote) => ({ moveNote, comment: noteComment(moveNote, chapter) })),
  );
  const comments = new Map<string, Comment>();
  for (const { comment } of jobs.flat()) if (comment) comments.set(comment.id, comment);

  const first = await ask(MODELS.convert, [...comments.values()]);
  const converted = new Map<string, Converted>();
  const retry: Comment[] = [];
  const convert = (answers: Map<string, Answer>) => {
    for (const { moveNote, comment } of jobs.flat()) {
      const answer = comment && answers.get(comment.id);
      if (!answer) continue;
      const result = convertedNotes(comment, answer, moveNote.move, moveNote.note.ideas ?? []);
      // An answer with no note at all would drop the comment: keep the importer's note instead.
      if (result.move.length + result.before.length === 0) continue;
      const previous = converted.get(comment.id);
      if (!previous || result.kept > previous.kept) converted.set(comment.id, result);
    }
  };
  convert(first);
  for (const [id, result] of converted) {
    if (result.kept === 0 && result.rejected.some(({ idea }) => idea.type !== 'evaluation')) retry.push(comments.get(id)!);
  }
  if (retry.length > 0) convert(await ask(MODELS.retry, retry));

  const chapters = extracted.map((chapter, i) => {
    const moveNotes: MoveNote[] = [];
    const added: PositionNote[] = [];
    const folded = new Set<PositionNote>();
    for (const { moveNote, comment } of jobs[i]) {
      const result = comment && converted.get(comment.id);
      if (!result) {
        moveNotes.push(moveNote);
        continue;
      }
      const { move, source } = moveNote;
      moveNotes.push(...result.move.map((note) => ({ move, note, source })));
      // The importer's notes from this comment on the same position join the model's
      // note there, so one comment makes one note per position.
      const [first, ...rest] = result.before;
      if (!first) continue;
      const key = positionKey(move.before);
      const own = chapter.positionNotes.filter((other) => other.source === source && positionKey(other.pos) === key);
      for (const other of own) folded.add(other);
      const ideas = [...own.flatMap((other) => other.note.ideas ?? []), ...(first.ideas ?? [])];
      const joined: Note = { ...first, ...(ideas.length > 0 && { ideas }) };
      added.push(...[joined, ...rest].map((note) => ({ pos: move.before, note, source })));
    }
    const positionNotes = [...chapter.positionNotes.filter((note) => !folded.has(note)), ...added];
    return { ...chapter, moveNotes, positionNotes };
  });
  const results = [...converted.values()];
  const shows: Record<ReviewKind, number> = { drawn: 0, badge: 0, text: 0 };
  for (const [id, comment] of comments) {
    const result = converted.get(id);
    const notes = result ? [...result.move, ...result.before] : [];
    shows[reviewKind([...comment.extracted, ...notes.flatMap((note) => note.ideas ?? [])])]++;
  }
  return {
    extracted: chapters,
    report: {
      comments: comments.size,
      unconverted: comments.size - converted.size,
      retried: retry.length,
      kept: results.reduce((sum, result) => sum + result.kept, 0),
      shows,
      rejected: results.flatMap((result) => result.rejected),
    },
  };
}

/** `report` as lines for the person running the import. */
export function convertReport({ comments, unconverted, retried, kept, shows, rejected }: ConvertReport): string {
  const why: Record<string, number> = {};
  for (const { idea, why: reason } of rejected) {
    const key = `${idea.type}: ${reason.replace(/[a-h][1-8]|\d+|[KQRBN]?[a-h]?x?[a-h][1-8][+#]?/g, '#')}`;
    why[key] = (why[key] ?? 0) + 1;
  }
  const top = Object.entries(why).sort(([, a], [, b]) => b - a).slice(0, 15);
  return [
    `converted comments: ${comments - unconverted} of ${comments} (${retried} asked again of ${MODELS.retry})`,
    `comments shown as: ${Object.entries(shows)
      .map(([kind, count]) => `${kind} ${count} (${Math.round((100 * count) / Math.max(1, comments))}%)`)
      .join(', ')}`,
    `AI ideas kept: ${kept}, dropped: ${rejected.length}`,
    ...top.map(([reason, count]) => `  ${count} ${reason}`),
  ].join('\n');
}
