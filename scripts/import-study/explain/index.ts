/**
 * The explain step: where the guides tell the learner to play a book move and
 * never say why (./unexplained.ts), Fable writes the move's idea as one short
 * note, marked `generated` so the app never passes it off as a guide's words.
 * Each note is checked like a converted comment and more (./notes.ts); a
 * refused note is asked again once with why, and dropped if refused again.
 * The model may also answer that it found no idea it is sure of: the move
 * then stays unexplained.
 *
 * Runs after the book is final (book filled, engine check, transpositions),
 * so it explains exactly the moves the lesson recommends. Its answers are kept
 * in scripts/import-study/answers/<name>-explain.jsonl, committed like the
 * converter's: `--no-model` rebuilds the notes from it.
 */
import type { Color } from 'chessops/types';

import type { Lesson, LessonMove, Note, PositionKey, Uci } from '@/lesson/lesson';

import { claudeCli, MODELS, type Ask } from '../convert/claude';
import { linesTo, type Evaluate } from '../engineCheck';
import { bookMoveItems, itemKey, type BookMove } from './items';
import { explainedNote, type Explained } from './notes';
import { EXPLAIN, REFUSED } from './prompt';
import { explainedCounts, unexplainedMoves } from './unexplained';

/** Book moves per request: fewer than comments, since each needs a fresh look at its board. */
const BATCH = 10;

/** The model runner for this step, keeping its answers in `cacheFile`. */
export function explainCli(options: {
  readonly learner: Color;
  readonly cacheFile: string;
  readonly callModel: boolean;
}) {
  return claudeCli<BookMove>({
    ...options,
    prompt: EXPLAIN,
    keyOf: itemKey,
    effort: 'medium',
    batch: BATCH,
    step: 'explain',
  });
}

export interface ExplainReport {
  readonly before: ReturnType<typeof explainedCounts>;
  readonly after: ReturnType<typeof explainedCounts>;
  /** Moves the model was asked about (or answered from the file). */
  readonly asked: number;
  readonly written: number;
  /** Moves the model found no sure idea for. */
  readonly unsure: number;
  /** Notes refused on the first answer, and asked again. */
  readonly retried: number;
  /** Notes refused on both answers, with why the second was. */
  readonly refused: readonly { readonly text: string; readonly why: string }[];
  /** Moves left with no usable answer (a failed request, or none stored for `--no-model`). */
  readonly unanswered: number;
}

/** `lesson` with a generated note on every unexplained book move the model explains. */
export async function explainBookMoves(
  lesson: Lesson,
  ask: Ask<BookMove>,
  evaluate: Evaluate,
): Promise<{ lesson: Lesson; report: ExplainReport }> {
  const moves = unexplainedMoves(lesson);
  const before = explainedCounts(lesson, moves);
  const jobs = await bookMoveItems(lesson, moves, linesTo(lesson), evaluate);
  const results = new Map<string, Explained>();
  const judge = async (items: readonly BookMove[], addendum?: string) => {
    const answers = await ask(MODELS.explain, items, addendum);
    for (const item of items) {
      const answer = answers.get(item.id);
      if (answer) results.set(item.id, explainedNote(answer, item));
    }
  };
  await judge(jobs.map(({ item }) => item));
  const retry = jobs.flatMap(({ item }) => {
    const result = results.get(item.id);
    return result && 'refused' in result ? [{ ...item, refused: [result.refused] }] : [];
  });
  // Only a retry's own answer counts: with none, the move is unanswered.
  for (const { id } of retry) results.delete(id);
  if (retry.length > 0) await judge(retry, REFUSED);

  const notes = new Map<string, Note>();
  for (const { move, item } of jobs) {
    const result = results.get(item.id);
    if (result && 'note' in result) notes.set(moveKey(move.key, move.uci), result.note);
  }
  const explained = withNotes(lesson, notes);
  const values = [...results.values()];
  return {
    lesson: explained,
    report: {
      before,
      after: explainedCounts(explained),
      asked: jobs.length,
      written: notes.size,
      unsure: values.filter((result) => 'none' in result).length,
      retried: retry.length,
      refused: values.flatMap((result) => ('refused' in result ? [result.refused] : [])),
      unanswered: jobs.length - results.size,
    },
  };
}

const moveKey = (key: PositionKey, uci: Uci) => `${key} ${uci}`;

/** `lesson` with each note in `notes` first on its move, keyed by `moveKey`. */
function withNotes(lesson: Lesson, notes: ReadonlyMap<string, Note>): Lesson {
  const positions = Object.fromEntries(
    Object.entries(lesson.positions).map(([key, pos]) => [
      key,
      {
        ...pos,
        moves: pos.moves.map((move): LessonMove => {
          const note = notes.get(moveKey(key, move.uci));
          return note ? { ...move, notes: [note, ...(move.notes ?? [])] } : move;
        }),
      },
    ]),
  );
  return { ...lesson, positions };
}

/** `report` as lines for the person running the import. */
export function explainReport({
  before,
  after,
  asked,
  written,
  unsure,
  retried,
  refused,
  unanswered,
}: ExplainReport): string {
  const counts = ({ book, none, verdict, fragment }: ExplainReport['before']) =>
    `${none + verdict + fragment} of ${book} book moves unexplained (${none} with no note, ${verdict} with only a verdict, ${fragment} with only a fragment)`;
  const why: Record<string, number> = {};
  for (const { why: reason } of refused) {
    const key = reason.replace(/[a-h][1-8]|\d+|[KQRBN]?[a-h]?x?[a-h][1-8][+#]?/g, '#');
    why[key] = (why[key] ?? 0) + 1;
  }
  return [
    `explain: before, ${counts(before)}`,
    `explain: asked ${MODELS.explain} about ${asked}: ${written} notes written, ${unsure} with no idea it was sure of, ${retried} asked again after a refusal, ${refused.length} refused twice, ${unanswered} unanswered`,
    ...Object.entries(why)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([reason, count]) => `  ${count} ${reason}`),
    `explain: after, ${counts(after)}`,
  ].join('\n');
}
