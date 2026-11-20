/**
 * The fixed formats of one chapter's comments, read without AI: the chapter
 * header, traps, plan lists, choice guides, evaluation glyphs, and move
 * sequences that exist only in comment text. Each comment becomes one note on
 * its move, and an idea about another position becomes a note on that one;
 * the AI step (later) rewrites the notes' text. A chapter header is the first
 * move's comment with an "Idea:" line (extra chapters put an "Extra:" line
 * before it).
 */
import type { Chess } from 'chessops/chess';
import type { Color } from 'chessops/types';

import { checkIdea } from '@/lesson/check';
import type { Evaluation, Idea, Note, Uci } from '@/lesson/lesson';

import { choiceGuide, type Choice } from './choices';
import { placeSequence, type Found, type Spot } from './line';
import { planLists } from './plans';
import { chapterMoves, type Chapter, type StudyMove } from './study';
import { direction, namedMoves, shorten, textVerdicts } from './text';
import { trapLines, watchOuts } from './traps';

export interface MoveNote {
  readonly move: StudyMove;
  readonly note: Note;
  /** The move whose comment the note comes from. */
  readonly source: StudyMove;
}
export interface PositionNote {
  readonly pos: Chess;
  readonly note: Note;
  /** The move whose comment the note comes from. */
  readonly source: StudyMove;
}
interface Branch {
  readonly spot: Spot;
  readonly ucis: readonly Uci[];
}
interface Rejected {
  readonly idea: Idea;
  readonly why: string;
  readonly comment: string;
}

export interface ChapterNotes {
  /** Notes on a move, said once it is played. */
  readonly moveNotes: readonly MoveNote[];
  /** Notes on a position, said while it is on the board. */
  readonly positionNotes: readonly PositionNote[];
  /** Move sequences from comment text, to add to the guide. */
  readonly branches: readonly Branch[];
  readonly choices: readonly Choice[];
  /** Ideas the checker refused, with why: the study's errors, or ours. */
  readonly rejected: readonly Rejected[];
  /** Evaluation glyphs dropped because the comment's text says otherwise. */
  readonly contradicted: number;
}

const NAG_EVALUATIONS: Readonly<Record<number, Evaluation>> = {
  10: 'equal',
  11: 'equal',
  12: 'equal',
  14: 'whiteSlightly',
  15: 'blackSlightly',
  16: 'whiteClearly',
  17: 'blackClearly',
  18: 'whiteWinning',
  19: 'blackWinning',
};

const EVALUATION_TEXT: Readonly<Record<Evaluation, string>> = {
  equal: 'The position is equal.',
  whiteSlightly: 'White is slightly better.',
  whiteClearly: 'White is clearly better.',
  whiteWinning: 'White is winning.',
  blackSlightly: 'Black is slightly better.',
  blackClearly: 'Black is clearly better.',
  blackWinning: 'Black is winning.',
};

/** Two or more moves in a row, the first numbered: `9...Qa5+ 10.Nc3 e6`. */
const SEQUENCE =
  /\d+\s?\.(?:\.\.)?\s?[^\s,;()]+(?:\s+(?:\d+\s?\.(?:\.\.)?\s?)?[KQRBNOa-h][^\s,;()]*)+/g;

export function extractChapter(chapter: Chapter, learner: Color): ChapterNotes {
  const moveNotes: MoveNote[] = [];
  const positionNotes: PositionNote[] = [];
  const branches: Branch[] = [];
  const choices: Choice[] = [];
  const rejected: Rejected[] = [];
  let contradicted = 0;

  for (const move of chapterMoves(chapter)) {
    const { comment } = move;
    const header = move.ply === 1 ? readHeader(chapter, comment) : undefined;
    // A header is about the whole chapter: it goes where the chapter's main line ends, not on move 1.
    const target = header?.mainLineEnd ?? move;
    const traps = trapLines(move, learner);
    const evaluation = glyphEvaluation(move, learner);
    if (evaluation === 'contradicted') contradicted++;
    const found: Found[] = [
      ...plans(chapter, move, header, learner),
      ...traps,
      ...(evaluation && evaluation !== 'contradicted' ? [evaluation] : []),
    ];
    branches.push(
      ...traps.map(({ spot, idea }) => ({ spot, ucis: idea.moves })),
      ...sequences(move),
    );
    choices.push(...choiceGuide(move, learner));

    const own: Found[] = [];
    for (const item of found) {
      const { spot, idea } = item;
      const why = checkIdea(idea, spot.pos);
      if (why) rejected.push({ idea, why, comment });
      else if (spot.move === target) own.push(item);
      // An idea about another position (often the one before the commented move) is said there.
      else positionNotes.push({ pos: spot.pos, note: awayNote(item), source: move });
    }
    // Without a comment, an evaluation glyph's text is the note.
    const text = comment || own.find(({ idea }) => idea.type === 'evaluation')?.text;
    if (text)
      moveNotes.push({
        move: target,
        note: note(
          text,
          own.map(({ idea }) => idea),
        ),
        source: move,
      });
  }
  return { moveNotes, positionNotes, branches, choices, rejected, contradicted };
}

/** The plans `move`'s comment states; a chapter header's watch-outs count as plans of the chapter. */
function plans(
  chapter: Chapter,
  move: StudyMove,
  header: Header | undefined,
  learner: Color,
): Found[] {
  if (header)
    return [
      ...planLists(move, header.idea, learner, true),
      ...watchOuts(chapter, header.watchOut, learner),
    ];
  return move.comment ? planLists(move, move.comment, learner) : [];
}

/** Sequences of two or more moves that `move`'s comment writes out, placed in the tree. */
function sequences(move: StudyMove) {
  return (move.comment.match(SEQUENCE) ?? []).flatMap((run) => {
    const placed = placeSequence(move, namedMoves(run));
    return placed && placed.ucis.length > 1 ? [placed] : [];
  });
}

/** The note of an idea that lands away from its comment, with the study's words in `original`. */
function awayNote({ idea, text, original }: Found): Note {
  return { text, ...(original && { original }), ideas: [idea] };
}

/**
 * A note on `source` (a comment, or an evaluation glyph's text): its first sentence
 * without a "Plan:" or "Trap:" label, since the note's ideas show its kind,
 * and the full wording in `original` when that differs.
 */
function note(source: string, ideas: readonly Idea[]): Note {
  const text = shorten(source).replace(/^(?:Plan|Trap):\s*/, '');
  return { text, ...(text !== source && { original: source }), ...(ideas.length > 0 && { ideas }) };
}

interface Header {
  readonly idea: string;
  readonly watchOut: string;
  /** The last move of the header's "Main line:" that the chapter's tree has. */
  readonly mainLineEnd?: StudyMove;
}

/** The rest of `comment`'s line that starts with `name:`, if it has one. */
const commentPart = (comment: string, name: string) =>
  comment.match(new RegExp(`^${name}:[ \\t]*(.*)$`, 'm'))?.[1];

/** The chapter header in `comment`, the first move's, if it has an "Idea:" line. */
function readHeader(chapter: Chapter, comment: string): Header | undefined {
  const idea = commentPart(comment, 'Idea');
  if (idea === undefined) return undefined;
  const part = (name: string) => commentPart(comment, name) ?? '';
  let mainLineEnd: StudyMove | undefined;
  let next = chapter.moves;
  for (const named of namedMoves(part('Main line'))) {
    const found = next.find((move) => move.san === named.san);
    if (!found) break;
    mainLineEnd = found;
    next = found.children;
  }
  return { idea, watchOut: part('Watch out'), mainLineEnd };
}

/**
 * The move's evaluation glyph, unless its comment states verdicts and none
 * agrees with the glyph: then the text wins and the glyph is dropped.
 */
function glyphEvaluation(move: StudyMove, learner: Color): Found | 'contradicted' | undefined {
  const value = move.nags.map((nag) => NAG_EVALUATIONS[nag]).find(Boolean);
  if (!value) return undefined;
  const verdicts = textVerdicts(move.comment, learner);
  if (verdicts.size > 0 && !verdicts.has(direction(value))) return 'contradicted';
  return {
    spot: { move, pos: move.after },
    idea: { type: 'evaluation', value },
    text: EVALUATION_TEXT[value],
  };
}
