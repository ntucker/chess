/**
 * The AI step: Sonnet rewrites every comment as short notes for the learner
 * and adds what the fixed formats missed as ideas the board draws. The
 * checker drops every idea that is false in its position; a comment whose
 * ideas were all dropped is asked again of Opus, and the answer keeping more
 * ideas wins. A comment whose note text the checker refuses as notation is
 * asked again of Opus with that text, and the answer in words replaces it; if
 * Opus writes notation too, or gives no answer (a failed request, or a
 * `--no-model` run without one stored), the lesson checker refuses the import.
 * A comment with no answer at all keeps the notes `extractChapter` made.
 *
 * Runs only when someone imports a study on purpose (`yarn import-study`):
 * the lesson file it writes is committed, so the site build and the tests
 * never call a model.
 */
import { makeSan } from 'chessops/san';
import { parseUci } from 'chessops/util';

import { parsePosition, positionKey, SAN, sanToUci } from '@/game/replay';
import { notationProblem } from '@/lesson/check';
import { noteShows, type Note, type NoteShows } from '@/lesson/lesson';

import type { ChapterNotes, MoveNote, PositionNote } from '../extract';
import type { Answer, AnswerIdea } from './answer';
import { MODELS, type Ask } from './claude';
import { noteComment, type Comment } from './comments';
import { convertedNotes, notesOf, type Converted } from './notes';
import { DRAW_MISTAKES, REWORD, SHORTEN, WRITTEN_FOR_OPPONENT } from './prompt';

/** How many comments were asked again of Opus, by why, and what the rewording changed. */
interface Retries {
  /** The checker refused every idea. */
  readonly retried: number;
  /** The checker refused note text as notation. */
  readonly reworded: number;
  /** The comment marks a move as a mistake (`3.e3?`) and no note draws how it is punished. */
  readonly punished: number;
  /** A note text ran over the word limit and was cut. */
  readonly shortened: number;
  /**
   * Ideas the reworded comments kept before and after: an answer in words
   * replaces the old one whatever it draws, so the report shows what changed.
   */
  readonly rewordedIdeas: { readonly before: number; readonly after: number };
}

export interface ConvertReport extends Retries {
  readonly comments: number;
  readonly unconverted: number;
  /** Ideas the model wrote that the lesson keeps. */
  readonly kept: number;
  /** What each comment ends up showing: something drawn, only an evaluation badge, or text alone. */
  readonly shows: Readonly<Record<NoteShows, number>>;
  readonly rejected: readonly { readonly idea: AnswerIdea; readonly why: string }[];
}

interface Job {
  readonly moveNote: MoveNote;
  /** Undefined for a note without a comment (an evaluation glyph alone). */
  readonly comment: Comment | undefined;
}

/** `extracted` with every commented move's notes rewritten by the model. */
export async function convertChapters(
  extracted: readonly ChapterNotes[],
  ask: Ask,
): Promise<{ extracted: ChapterNotes[]; report: ConvertReport }> {
  const jobs = extracted.map((chapter) =>
    chapter.moveNotes.map((moveNote): Job => ({
      moveNote,
      comment: noteComment(moveNote, chapter),
    })),
  );
  const comments = new Map<string, Comment>();
  for (const { comment } of jobs.flat()) if (comment) comments.set(comment.id, comment);
  const { converted, retries } = await convertComments(jobs.flat(), comments, ask);
  return {
    extracted: extracted.map((chapter, i) => convertedChapter(chapter, jobs[i], converted)),
    report: convertedReport(comments, converted, retries),
  };
}

/**
 * Each comment's notes by comment id: Sonnet's answer, or Opus's where Sonnet's
 * ideas were all refused and Opus keeps more, or where the text was notation
 * and Opus words it. A comment the model left without a note is missing, so it
 * keeps the importer's note.
 */
async function convertComments(
  jobs: readonly Job[],
  comments: ReadonlyMap<string, Comment>,
  askModel: Ask,
): Promise<{ converted: Map<string, Converted>; retries: Retries }> {
  const ask = withWrittenFor(askModel);
  const converted = new Map<string, Converted>();
  /** Puts each answer's notes in `converted` where there are none yet or they `replace` what is there. */
  const keep = (
    answers: Map<string, Answer>,
    replaces: (result: Converted, previous: Converted, comment: Comment) => boolean,
  ) => {
    for (const { moveNote, comment } of jobs) {
      const answer = comment && answers.get(comment.id);
      if (!answer) continue;
      const result = convertedNotes(comment, answer, moveNote.move, moveNote.note.ideas ?? []);
      if (notesOf(result).length === 0) continue;
      const previous = converted.get(comment.id);
      if (!previous || replaces(result, previous, comment)) converted.set(comment.id, result);
    }
  };
  const keepsMore = (result: Converted, previous: Converted) => result.kept > previous.kept;
  keep(await ask(MODELS.convert, [...comments.values()]), keepsMore);
  const retry = [...converted]
    .filter(([, result]) => allRefused(result))
    .map(([id]) => comments.get(id)!);
  if (retry.length > 0) keep(await ask(MODELS.retry, retry), keepsMore);
  const reword = [...converted].flatMap(([id, result]) => {
    const refusedText = notationTexts(result);
    return refusedText.length > 0 ? [{ ...comments.get(id)!, refusedText }] : [];
  });
  const keptByReworded = () =>
    reword.reduce((sum, { id }) => sum + (converted.get(id)?.kept ?? 0), 0);
  // Read before the rewording answers replace any of them.
  const before = keptByReworded();
  if (reword.length > 0)
    keep(await ask(MODELS.retry, reword, REWORD), (result) => notationTexts(result).length === 0);
  const punish = [...converted].flatMap(([id, result]) => {
    const comment = comments.get(id)!;
    const mistakes = undrawnMistakes(comment, result);
    return mistakes.length > 0 ? [{ ...comment, mistakes }] : [];
  });
  // Without an answer (a --no-model run, a failed request) the earlier notes stay.
  if (punish.length > 0)
    keep(
      await ask(MODELS.retry, punish, DRAW_MISTAKES),
      (result, previous, comment) =>
        notationTexts(result).length === 0 &&
        drawnMistakes(comment, result) > drawnMistakes(comment, previous),
    );
  const shorten = [...converted].flatMap(([id, result]) => {
    const cutText = result.cut;
    return cutText.length > 0 ? [{ ...comments.get(id)!, cutText }] : [];
  });
  if (shorten.length > 0)
    keep(
      await ask(MODELS.retry, shorten, SHORTEN),
      (result, previous, comment) =>
        result.cut.length === 0 &&
        notationTexts(result).length === 0 &&
        drawnMistakes(comment, result) >= drawnMistakes(comment, previous),
    );
  return {
    converted,
    retries: {
      retried: retry.length,
      reworded: reword.length,
      rewordedIdeas: { before, after: keptByReworded() },
      punished: punish.length,
      shortened: shorten.length,
    },
  };
}

/** A move a comment marks as a mistake with `?` or `??` (not `?!`), numbered: `3.e3?`, `5...Bf5?`. */
const MISTAKE = new RegExp(String.raw`\b(\d+)\s?\.(\.\.)?\s?(${SAN})\?(?!!)`, 'g');

/**
 * The moves `comment` marks as mistakes (`3.e3?`) that the side to move can
 * play after its move, in UCI and in SAN as the model reads moves: what a
 * note warning against one should show is how it is punished. A mistake's
 * number and side must be the next move's, since a comment also warns about
 * moves deeper in its lines (`5.Bd2?` after 3...e6).
 */
function commentMistakes(comment: Comment): { uci: string; san: string }[] {
  const marked = [...comment.comment.matchAll(MISTAKE)];
  if (marked.length === 0) return [];
  const pos = parsePosition(comment.fenAfter)!;
  const found = new Map<string, string>();
  for (const [, number, dots, written] of marked) {
    if (Number(number) !== pos.fullmoves || (dots ? 'black' : 'white') !== pos.turn) continue;
    const uci = sanToUci(pos, written);
    if (uci && !found.has(uci)) found.set(uci, makeSan(pos, parseUci(uci)!));
  }
  return [...found].map(([uci, san]) => ({ uci, san }));
}

/** The trap and line ideas in `result`, by their first move. */
const drawnFirstMoves = (result: Converted) =>
  new Set(
    notesOf(result).flatMap((note) =>
      (note.ideas ?? []).flatMap((idea) =>
        idea.type === 'trap' || idea.type === 'line' ? [idea.moves[0]] : [],
      ),
    ),
  );

/** How many of `comment`'s mistakes `result` draws a trap or line from. */
const drawnMistakes = (comment: Comment, result: Converted) => {
  const drawn = drawnFirstMoves(result);
  return commentMistakes(comment).filter(({ uci }) => drawn.has(uci)).length;
};

/** `comment`'s mistakes that `result` draws no trap or line from, in SAN. */
function undrawnMistakes(comment: Comment, result: Converted): string[] {
  const drawn = drawnFirstMoves(result);
  return commentMistakes(comment)
    .filter(({ uci }) => !drawn.has(uci))
    .map(({ san }) => san);
}

/**
 * `ask`, telling the model about comments written for the learner's opponent
 * (`Comment.writtenFor`). The others are asked as before, so their stored
 * answers still match.
 */
const withWrittenFor =
  (ask: Ask): Ask =>
  async (model, comments, addendum = '') => {
    const own = comments.filter((comment) => !comment.writtenFor);
    const theirs = comments.filter((comment) => comment.writtenFor);
    const answers = own.length > 0 ? await ask(model, own, addendum) : new Map<string, Answer>();
    if (theirs.length > 0)
      for (const entry of await ask(model, theirs, WRITTEN_FOR_OPPONENT + addendum))
        answers.set(...entry);
    return answers;
  };

/** The model wrote drawable ideas and the checker refused every one. */
const allRefused = (result: Converted) =>
  result.kept === 0 && result.rejected.some(({ idea }) => idea.type !== 'evaluation');

/** The note texts in `result` that the lesson checker refuses as notation. */
const notationTexts = (result: Converted) =>
  notesOf(result)
    .map((note) => note.text)
    .filter((text) => notationProblem(text) !== undefined);

/**
 * `chapter` with each converted comment's notes in place of the importer's.
 * The importer's notes from a comment on the position before its move join
 * the model's note there, so one comment makes one note per position.
 */
function convertedChapter(
  chapter: ChapterNotes,
  jobs: readonly Job[],
  converted: ReadonlyMap<string, Converted>,
): ChapterNotes {
  const moveNotes: MoveNote[] = [];
  const added: PositionNote[] = [];
  const joined = new Set<PositionNote>();
  for (const { moveNote, comment } of jobs) {
    const result = comment && converted.get(comment.id);
    if (!result) {
      moveNotes.push(moveNote);
      continue;
    }
    const { move, source } = moveNote;
    moveNotes.push(...result.move.map((note) => ({ move, note, source })));
    const [first, ...rest] = result.before;
    if (!first) continue;
    const key = positionKey(move.before);
    const own = chapter.positionNotes.filter(
      (other) => other.source === source && positionKey(other.pos) === key,
    );
    for (const other of own) joined.add(other);
    const ideas = [...own.flatMap((other) => other.note.ideas ?? []), ...(first.ideas ?? [])];
    const note: Note = { ...first, ...(ideas.length > 0 && { ideas }) };
    added.push(...[note, ...rest].map((before) => ({ pos: move.before, note: before, source })));
  }
  const positionNotes = [...chapter.positionNotes.filter((note) => !joined.has(note)), ...added];
  return { ...chapter, moveNotes, positionNotes };
}

function convertedReport(
  comments: ReadonlyMap<string, Comment>,
  converted: ReadonlyMap<string, Converted>,
  retries: Retries,
): ConvertReport {
  const results = [...converted.values()];
  const shows: Record<NoteShows, number> = { drawn: 0, badge: 0, text: 0 };
  for (const [id, comment] of comments) {
    const result = converted.get(id);
    const notes = result ? notesOf(result) : [];
    shows[noteShows([...comment.extracted, ...notes.flatMap((note) => note.ideas ?? [])])]++;
  }
  return {
    comments: comments.size,
    unconverted: comments.size - converted.size,
    ...retries,
    kept: results.reduce((sum, result) => sum + result.kept, 0),
    shows,
    rejected: results.flatMap((result) => result.rejected),
  };
}

/** `report` as lines for the person running the import. */
export function convertReport({
  comments,
  unconverted,
  retried,
  reworded,
  punished,
  shortened,
  rewordedIdeas,
  kept,
  shows,
  rejected,
}: ConvertReport): string {
  const why: Record<string, number> = {};
  for (const { idea, why: reason } of rejected) {
    const key = `${idea.type}: ${reason.replace(/[a-h][1-8]|\d+|[KQRBN]?[a-h]?x?[a-h][1-8][+#]?/g, '#')}`;
    why[key] = (why[key] ?? 0) + 1;
  }
  const top = Object.entries(why)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 15);
  return [
    `converted comments: ${comments - unconverted} of ${comments} (asked again of ${MODELS.retry}: ${retried} with every idea refused, ${reworded} with notes in notation, ${punished} with a mistake's punishment undrawn, ${shortened} with notes cut at the word limit)`,
    ...(reworded > 0
      ? [
          `  ideas the comments with notes in notation keep: ${rewordedIdeas.before} before, ${rewordedIdeas.after} after`,
        ]
      : []),
    `comments shown as: ${Object.entries(shows)
      .map(
        ([kind, count]) =>
          `${kind} ${count} (${Math.round((100 * count) / Math.max(1, comments))}%)`,
      )
      .join(', ')}`,
    `AI ideas kept: ${kept}, dropped: ${rejected.length}`,
    ...top.map(([reason, count]) => `  ${count} ${reason}`),
  ].join('\n');
}
