/**
 * The fixed formats of one chapter's comments, read without AI: the chapter
 * header, traps, plan lists, choice guides, evaluation glyphs, and move
 * sequences that exist only in comment text. Each comment becomes one note on
 * its move; the AI step (later) rewrites the notes' text.
 */
import type { Color } from 'chessops/types';

import { checkIdea } from '@/lesson/check';
import type { Evaluation, Idea, Note, Uci } from '@/lesson/lesson';

import { choiceGuide, type Choice } from './choices';
import { placeSequence, type Spot } from './line';
import { planLists } from './plans';
import { chapterMoves, type Chapter, type StudyMove } from './study';
import { direction, namedMoves, shorten, textVerdicts } from './text';
import { trapLines, watchOuts } from './traps';

/** An idea a comment states, and the position it is about. */
export interface Found {
  readonly spot: Spot;
  readonly idea: Idea;
  /** What the idea says, as the text of its own note when it lands away from its comment. */
  readonly label: string;
}

export interface ChapterNotes {
  /** Notes on a move, or on the chapter's start when `move` is undefined. */
  readonly notes: readonly { readonly move?: StudyMove; readonly note: Note }[];
  /** Move sequences from comment text, to add to the guide. */
  readonly branches: readonly { readonly spot: Spot; readonly ucis: readonly Uci[] }[];
  readonly choices: readonly Choice[];
  /** Ideas the checker refused, with why: the study's errors, or ours. */
  readonly rejected: readonly { readonly idea: Idea; readonly why: string; readonly comment: string }[];
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
const SEQUENCE = /\d+\s?\.(?:\.\.)?\s?[^\s,;()]+(?:\s+(?:\d+\s?\.(?:\.\.)?\s?)?[KQRBNOa-h][^\s,;()]*)+/g;

export function extractChapter(chapter: Chapter, learner: Color): ChapterNotes {
  const notes: { move?: StudyMove; note: Note }[] = [];
  const branches: { spot: Spot; ucis: readonly Uci[] }[] = [];
  const choices: Choice[] = [];
  const rejected: { idea: Idea; why: string; comment: string }[] = [];
  let contradicted = 0;

  for (const move of chapterMoves(chapter)) {
    const found: Found[] = [];
    const { comment } = move;
    const header = move.ply === 1 && /^\s*Idea:/.test(comment) ? readHeader(chapter, comment) : undefined;
    // A header is about the whole chapter: it goes where the chapter's main line ends, not on move 1.
    const target = header?.mainLineEnd ?? move;
    if (header) {
      found.push(...planLists(move, header.idea, true), ...watchOuts(chapter, header.watchOut));
    } else if (comment) {
      found.push(...planLists(move, comment));
    }
    for (const trap of trapLines(move)) {
      found.push(trap);
      branches.push({ spot: trap.spot, ucis: trap.idea.moves });
    }
    for (const run of comment.match(SEQUENCE) ?? []) {
      const placed = placeSequence(move, namedMoves(run));
      if (placed && placed.ucis.length > 1) branches.push(placed);
    }
    choices.push(...choiceGuide(move, learner));
    const evaluation = glyphEvaluation(move, learner);
    if (evaluation === 'contradicted') contradicted++;
    else if (evaluation) found.push({ spot: { move, pos: move.after }, idea: evaluation, label: EVALUATION_TEXT[evaluation.value] });

    const own: Idea[] = [];
    for (const { spot, idea, label } of found) {
      const why = checkIdea(idea, { after: spot.pos });
      if (why) {
        rejected.push({ idea, why, comment });
        continue;
      }
      if (spot.move === target) own.push(idea);
      else if (spot.move === target.parent) own.push({ ...idea, at: 'before' });
      else notes.push({ move: spot.move, note: { text: shorten(label), ideas: [idea] } });
    }
    const text = comment || (own[0]?.type === 'evaluation' ? EVALUATION_TEXT[own[0].value] : '');
    if (text) notes.push({ move: target, note: note(text, own) });
  }
  return { notes, branches, choices, rejected, contradicted };
}

function note(comment: string, ideas: readonly Idea[]): Note {
  const text = shorten(comment);
  return { text, ...(text !== comment && { original: comment }), ...(ideas.length > 0 && { ideas }) };
}

interface Header {
  readonly idea: string;
  readonly watchOut: string;
  /** The last move of the header's "Main line:" that the chapter's tree has. */
  readonly mainLineEnd?: StudyMove;
}

function readHeader(chapter: Chapter, comment: string): Header {
  const part = (name: string) => comment.match(new RegExp(`^${name}:\\s*(.*)$`, 'm'))?.[1] ?? '';
  let mainLineEnd: StudyMove | undefined;
  let next = chapter.moves;
  for (const named of namedMoves(part('Main line'))) {
    const found = next.find((move) => move.san === named.san);
    if (!found) break;
    mainLineEnd = found;
    next = found.children;
  }
  return { idea: part('Idea'), watchOut: part('Watch out'), mainLineEnd };
}

/**
 * The move's evaluation glyph, unless its comment states verdicts and none
 * agrees with the glyph: then the text wins and the glyph is dropped.
 */
function glyphEvaluation(move: StudyMove, learner: Color): (Idea & { type: 'evaluation' }) | 'contradicted' | undefined {
  const value = move.nags.map((nag) => NAG_EVALUATIONS[nag]).find(Boolean);
  if (!value) return undefined;
  const verdicts = textVerdicts(move.comment, learner);
  if (verdicts.size > 0 && !verdicts.has(direction(value))) return 'contradicted';
  return { type: 'evaluation', value };
}
