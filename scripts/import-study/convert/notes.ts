/**
 * One comment's answer turned into lesson notes: moves replayed from SAN to
 * UCI, the rules the checker can't know applied, and every idea the checker
 * refuses dropped, so the comment's idea stays in the note's text.
 */
import type { Chess } from 'chessops/chess';
import { isDeepStrictEqual } from 'node:util';

import { sanToUci, withTurn } from '@/game/replay';
import { MAX_NOTE_WORDS, type AiModel, type StructureFeature, type Uci } from '@/lesson/lesson';

import { checkStudyIdea, type StudyIdea, type StudyNote } from '../mistakes';
import { played } from '../study';
import { shorten } from '../text';
import type { Answer, AnswerFeature, AnswerIdea } from './answer';
import type { Comment } from './comments';

export interface Converted {
  /** Notes on the commented move. */
  readonly move: readonly StudyNote[];
  /** Notes on the position before it. */
  readonly before: readonly StudyNote[];
  /** Ideas the model wrote that the lesson keeps. */
  readonly kept: number;
  readonly rejected: readonly { readonly idea: AnswerIdea; readonly why: string }[];
  /** StudyNote texts cut mid-sentence at the word limit, as cut: the model's, or the comment's where it wrote no note on the move. */
  readonly cut: readonly string[];
}

/** Every note in `result`, on the move and before it. */
export const notesOf = (result: Converted): readonly StudyNote[] => [
  ...result.move,
  ...result.before,
];

/**
 * `answer` for `comment` as notes credited to `model`, which wrote it, checked
 * in `positions`. `own` is the importer's ideas on the move's note: they join
 * the model's first note on the move. Ideas repeating anything in
 * `comment.extracted` (those, plus the importer's notes on other positions)
 * are dropped.
 */
export function convertedNotes(
  comment: Comment,
  answer: Answer,
  model: AiModel,
  positions: { readonly before: Chess; readonly after: Chess },
  own: readonly StudyIdea[],
): Converted {
  const rejected: { idea: AnswerIdea; why: string }[] = [];
  const extractedEvaluation = comment.extracted.some((idea) => idea.type === 'evaluation');
  let kept = 0;
  const cut: string[] = [];
  /** `noteText`, remembering a text it cuts mid-sentence (not just to its first sentence). */
  const shown = (written: string) => {
    const text = noteText(written);
    if (text !== labelless(written) && text.endsWith('…')) cut.push(text);
    return text;
  };
  const notesAbout = (about: 'move' | 'before') =>
    answer.notes
      .filter((note) => note.about === about)
      .map((note): StudyNote => {
        const pos = about === 'move' ? positions.after : positions.before;
        const ideas = note.ideas.flatMap((raw) => {
          const result = lessonIdea(raw, pos, extractedEvaluation);
          if (typeof result === 'string') {
            rejected.push({ idea: raw, why: result });
            return [];
          }
          if (comment.extracted.some((idea) => isDeepStrictEqual(idea, result))) return [];
          kept++;
          return [result];
        });
        return lessonNote(shown(note.text), comment.comment, ideas, model);
      })
      .filter((note) => note.text);
  const before = notesAbout('before');
  const moves = notesAbout('move');
  const [first, ...rest] = moves;
  const move =
    own.length === 0
      ? moves
      : [
          // With no note of the model's on the move, the comment's own words stand, credited to no model.
          lessonNote(
            first?.text ?? shown(comment.comment),
            comment.comment,
            [...own, ...(first?.ideas ?? [])],
            first ? model : undefined,
          ),
          ...rest,
        ];
  return { move, before, kept, rejected, cut };
}

/** The note's text without a label the card already shows, cut to the word limit. */
function noteText(text: string): string {
  const plain = labelless(text);
  return plain.split(/\s+/).filter(Boolean).length > MAX_NOTE_WORDS ? shorten(plain) : plain;
}

/** `text` without a label the card already shows ("Plan:"). */
const labelless = (text: string) =>
  text.trim().replace(/^(?:Plan|Trap|Threat|StudyIdea|Line)\s*:\s*/i, '');

function lessonNote(
  text: string,
  original: string,
  ideas: readonly StudyIdea[],
  model: AiModel | undefined,
): StudyNote {
  return {
    text,
    ...(text !== original && { original }),
    ...(model && { model }),
    ...(ideas.length > 0 && { ideas }),
  };
}

/**
 * `raw` as a lesson idea in `pos`, or why it is dropped: a move that is not
 * legal, a rule from the spike (a threat by the side to move, an evaluation
 * where the importer already read one), or the checker's verdict.
 */
export function lessonIdea(
  raw: AnswerIdea,
  pos: Chess,
  extractedEvaluation: boolean,
): StudyIdea | string {
  try {
    const idea = withUci(raw, pos);
    if (idea.type === 'threat' && idea.side === pos.turn)
      return 'a threat is never a move by the side to move';
    if (idea.type === 'evaluation' && extractedEvaluation)
      return 'an evaluation was already extracted';
    return checkStudyIdea(idea, pos) ?? idea;
  } catch (error) {
    if (error instanceof IllegalSan) return error.message;
    throw error;
  }
}

class IllegalSan extends Error {}

/** `san` in `pos` as UCI. */
function uci(pos: Chess, san: string): Uci {
  const move = sanToUci(pos, san);
  if (!move) throw new IllegalSan(`${san} is not legal for ${pos.turn} here`);
  return move;
}

/** The UCI moves of `sans`, played one after another from `pos`. */
function line(pos: Chess, sans: readonly string[]): Uci[] {
  let at = pos;
  return sans.map((san) => {
    const move = uci(at, san);
    at = played(at, move);
    return move;
  });
}

function withUci(raw: AnswerIdea, pos: Chess): StudyIdea {
  switch (raw.type) {
    case 'threat': {
      const threatening = withTurn(pos, raw.side);
      const move = uci(threatening, raw.move);
      if (raw.answer === undefined) return { type: 'threat', side: raw.side, move };
      const answerFrom = pos.turn === raw.side ? played(threatening, move) : pos;
      return { type: 'threat', side: raw.side, move, answer: uci(answerFrom, raw.answer) };
    }
    case 'trap':
    case 'line':
      return { ...raw, moves: line(pos, raw.moves) } as StudyIdea;
    case 'structure':
      return {
        ...raw,
        features: raw.features.map((feature) => structureFeature(feature, pos, raw.side)),
      };
    default:
      return raw;
  }
}

function structureFeature(
  feature: AnswerFeature,
  pos: Chess,
  side: Chess['turn'],
): StructureFeature {
  if (feature.kind !== 'pawnBreak') return feature;
  return { kind: 'pawnBreak', move: uci(withTurn(pos, side), feature.move) };
}
