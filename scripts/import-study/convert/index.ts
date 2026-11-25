/**
 * The AI step: Sonnet rewrites every comment as short notes for the learner
 * and adds what the fixed formats missed as ideas the board draws. The
 * checker drops every idea that is false in its position; a comment whose
 * ideas were all dropped, or whose trap that starts later was
 * (`Comment.trapStart`), is asked again of Opus, and the answer keeping more
 * ideas wins. A comment whose note text the checker refuses as notation is
 * asked again of Opus with that text, and the answer in words replaces it; if
 * Opus writes notation too, or gives no answer (a failed request, or a
 * `--no-model` run without one stored), the lesson checker refuses the import.
 * A note that points to the study itself ("covered in chapter 12"), which the
 * learner never sees, is asked again the same way; if the answer still does,
 * the first note stays and the lesson checker refuses the import.
 * A comment with no answer at all keeps the notes `extractChapter` made.
 *
 * Runs only when someone imports a study on purpose (`yarn import-study`):
 * the lesson file it writes is committed, so the site build and the tests
 * never call a model.
 */
import type { Chess } from 'chessops/chess';
import { makeSan } from 'chessops/san';
import { parseUci } from 'chessops/util';

import { parsePosition, positionKey, sanToUci } from '@/game/replay';
import { notationProblem, pointsToStudy } from '@/lesson/check';
import { noteShows, type AiModel, type NoteShows } from '@/lesson/lesson';

import type { ChapterNotes, MoveNote, PositionNote } from '../extract';
import type { StudyNote } from '../mistakes';
import { topReasons } from '../report';
import { trapPosition } from '../study';
import { namedMoves, nextPly } from '../text';
import type { Answer, AnswerIdea } from './answer';
import { MODELS, type Ask } from './claude';
import { noteComment, type Comment } from './comments';
import { convertedNotes, notesOf, type Converted } from './notes';
import {
  DRAW_MISTAKES,
  REWORD,
  SHORTEN,
  STANDALONE,
  TRAP_START,
  WRITTEN_FOR_OPPONENT,
} from './prompt';

/** How many comments were asked again of Opus, by why, and what the rewording changed. */
interface Retries {
  /** The checker refused every idea, or the trap of a comment whose trap starts later. */
  readonly retried: number;
  /** The checker refused note text as notation. */
  readonly reworded: number;
  /** A note text pointed to the study itself (`STANDALONE`). */
  readonly unmoored: number;
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
  /** Where the comment's trap starts (`Comment.trapStart`): its trap notes go there. */
  readonly trap?: Chess;
}

/** `extracted` with every commented move's notes rewritten by the model. */
export async function convertChapters(
  extracted: readonly ChapterNotes[],
  ask: Ask,
): Promise<{ extracted: ChapterNotes[]; report: ConvertReport }> {
  const jobs = extracted.map((chapter) =>
    chapter.moveNotes.map((moveNote): Job => {
      const comment = noteComment(moveNote, chapter);
      const trap = comment?.trapStart && trapPosition(moveNote.source);
      return { moveNote, comment, ...(trap && { trap }) };
    }),
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
  const ask = withAddenda(askModel);
  const converted = new Map<string, Converted>();
  /**
   * Asks `model` about `items` and puts each answer's notes in `converted`
   * where there are none yet or they `replace` what is there.
   */
  const askAndKeep = async (
    model: AiModel,
    items: readonly Comment[],
    replaces: (result: Converted, previous: Converted, comment: Comment) => boolean,
    addendum?: string,
  ) => {
    const answers = await ask(model, items, addendum);
    for (const { moveNote, comment, trap } of jobs) {
      const answer = comment && answers.get(comment.id);
      if (!answer) continue;
      const { move } = moveNote;
      const result = convertedNotes(
        comment,
        answer,
        model,
        { before: move.before, after: move.after, ...(trap && { trap }) },
        moveNote.note.ideas ?? [],
      );
      if (notesOf(result).length === 0) continue;
      const previous = converted.get(comment.id);
      if (!previous || replaces(result, previous, comment)) converted.set(comment.id, result);
    }
  };
  const keepsMore = (result: Converted, previous: Converted) => result.kept > previous.kept;
  await askAndKeep(MODELS.convert, [...comments.values()], keepsMore);
  const retry = [...converted]
    .filter(([id, result]) => allRefused(result) || trapUndrawn(comments.get(id)!, result))
    .map(([id]) => comments.get(id)!);
  if (retry.length > 0) await askAndKeep(MODELS.retry, retry, keepsMore);
  /** The comments whose answer has note texts `textsOf` picks out as refused, each with those texts. */
  const refusedBy = (textsOf: (result: Converted) => string[]) =>
    [...converted].flatMap(([id, result]) => {
      const refusedText = textsOf(result);
      return refusedText.length > 0 ? [{ ...comments.get(id)!, refusedText }] : [];
    });
  const reword = refusedBy(notationTexts);
  const keptByReworded = () =>
    reword.reduce((sum, { id }) => sum + (converted.get(id)?.kept ?? 0), 0);
  // Read before the rewording answers replace any of them.
  const before = keptByReworded();
  if (reword.length > 0)
    await askAndKeep(MODELS.retry, reword, (result) => notationTexts(result).length === 0, REWORD);
  const unmoored = refusedBy(studyTexts);
  if (unmoored.length > 0) await askAndKeep(MODELS.retry, unmoored, acceptedText, STANDALONE);
  const punish = [...converted].flatMap(([id, result]) => {
    const comment = comments.get(id)!;
    const mistakes = undrawnMistakes(comment, result);
    return mistakes.length > 0 ? [{ ...comment, mistakes }] : [];
  });
  // Without an answer (a --no-model run, a failed request) the earlier notes stay.
  if (punish.length > 0)
    await askAndKeep(
      MODELS.retry,
      punish,
      (result, previous, comment) =>
        acceptedText(result) && drawnMistakes(comment, result) > drawnMistakes(comment, previous),
      DRAW_MISTAKES,
    );
  // A comment marking mistakes is asked to draw them again too, so a shorter answer can keep them.
  const shorten = [...converted].flatMap(([id, result]) => {
    const comment = comments.get(id)!;
    const mistakes = commentMistakes(comment).map(({ san }) => san);
    return result.cut.length > 0
      ? [{ ...comment, cutText: result.cut, ...(mistakes.length > 0 && { mistakes }) }]
      : [];
  });
  const plain = shorten.filter((comment) => !comment.mistakes);
  const drawing = shorten.filter((comment) => comment.mistakes);
  const shortened = (result: Converted, previous: Converted, comment: Comment) =>
    result.cut.length === 0 &&
    acceptedText(result) &&
    drawnMistakes(comment, result) >= drawnMistakes(comment, previous);
  if (plain.length > 0) await askAndKeep(MODELS.retry, plain, shortened, SHORTEN);
  if (drawing.length > 0)
    await askAndKeep(MODELS.retry, drawing, shortened, DRAW_MISTAKES + SHORTEN);
  return {
    converted,
    retries: {
      retried: retry.length,
      reworded: reword.length,
      rewordedIdeas: { before, after: keptByReworded() },
      unmoored: unmoored.length,
      punished: punish.length,
      shortened: shorten.length,
    },
  };
}

/**
 * The moves `comment` marks as mistakes (`3.e3?`, not `?!`) that the side to
 * move can play after its move, in UCI and in SAN as the model reads moves:
 * what a note warning against one should show is how it is punished. A
 * mistake must be the next move by its number, since a comment also warns
 * about moves deeper in its lines (`5.Bd2?` after 3...e6). A bare move counts
 * only when a numbered move before it places it (`3.Nf3 e6?`).
 */
function commentMistakes(comment: Comment): { uci: string; san: string }[] {
  const marked = namedMoves(comment.comment).filter(({ glyph }) => glyph === '?' || glyph === '??');
  if (marked.length === 0) return [];
  const pos = parsePosition(comment.fenAfter)!;
  const next = nextPly(pos);
  const found = new Map<string, string>();
  for (const { san, ply, side } of marked) {
    if (ply !== next || side !== pos.turn) continue;
    const uci = sanToUci(pos, san);
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
 * (`Comment.writtenFor`) and comments whose trap starts later
 * (`Comment.trapStart`). The others are asked as before, so their stored
 * answers still match.
 */
const withAddenda =
  (ask: Ask): Ask =>
  async (model, comments, addendum = '') => {
    const byAddenda = Map.groupBy(
      comments,
      (comment) =>
        (comment.writtenFor ? WRITTEN_FOR_OPPONENT : '') + (comment.trapStart ? TRAP_START : ''),
    );
    const answers = new Map<string, Answer>();
    for (const [prefix, group] of byAddenda)
      for (const entry of await ask(model, group, prefix + addendum)) answers.set(...entry);
    return answers;
  };

/** A comment whose trap starts later (`Comment.trapStart`) without a trap the checker kept. */
const trapUndrawn = (comment: Comment, result: Converted) =>
  comment.trapStart !== undefined &&
  !result.trap.some((note) => note.ideas?.some((idea) => idea.type === 'trap'));

/** The model wrote drawable ideas and the checker refused every one. */
const allRefused = (result: Converted) =>
  result.kept === 0 && result.rejected.some(({ idea }) => idea.type !== 'evaluation');

/** The note texts in `result` that `refused` finds. */
const textsWhere = (result: Converted, refused: (text: string) => boolean) =>
  notesOf(result)
    .map((note) => note.text)
    .filter(refused);

/** The note texts in `result` that point to the study itself. */
const studyTexts = (result: Converted) => textsWhere(result, pointsToStudy);

/** The note texts in `result` that the lesson checker refuses as notation. */
const notationTexts = (result: Converted) =>
  textsWhere(result, (text) => notationProblem(text) !== undefined);

/** No note text in notation or pointing to the study: what a later retry's answer needs to replace. */
const acceptedText = (result: Converted) =>
  notationTexts(result).length === 0 && studyTexts(result).length === 0;

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
  for (const { moveNote, comment, trap } of jobs) {
    const result = comment && converted.get(comment.id);
    if (!result) {
      moveNotes.push(moveNote);
      continue;
    }
    const { move, source } = moveNote;
    moveNotes.push(...result.move.map((note) => ({ move, note, source })));
    if (trap) added.push(...result.trap.map((note) => ({ pos: trap, note, source })));
    const [first, ...rest] = result.before;
    if (!first) continue;
    const key = positionKey(move.before);
    const own = chapter.positionNotes.filter(
      (other) => other.source === source && positionKey(other.pos) === key,
    );
    for (const other of own) joined.add(other);
    const ideas = [...own.flatMap((other) => other.note.ideas ?? []), ...(first.ideas ?? [])];
    const note: StudyNote = { ...first, ...(ideas.length > 0 && { ideas }) };
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
  unmoored,
  punished,
  shortened,
  rewordedIdeas,
  kept,
  shows,
  rejected,
}: ConvertReport): string {
  const top = topReasons(
    rejected.map(({ idea, why }) => `${idea.type}: ${why}`),
    15,
  );
  return [
    `converted comments: ${comments - unconverted} of ${comments} (asked again of ${MODELS.retry}: ${retried} with every idea or a later trap refused, ${reworded} with notes in notation, ${unmoored} with notes pointing to the study, ${punished} with a mistake's punishment undrawn, ${shortened} with notes cut at the word limit)`,
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
