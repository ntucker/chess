/**
 * One comment's answer turned into lesson notes: moves replayed from SAN to
 * UCI, the rules the checker can't know applied, and every idea the checker
 * refuses dropped, so the comment's idea stays in the note's text.
 */
import type { Chess } from 'chessops/chess';
import { isDeepStrictEqual } from 'node:util';

import { sanToUci } from '@/game/replay';
import { checkIdea, withTurn } from '@/lesson/check';
import { MAX_NOTE_WORDS, type Idea, type Note, type StructureFeature, type Uci } from '@/lesson/lesson';

import { played } from '../study';
import { shorten } from '../text';
import type { Answer, AnswerFeature, AnswerIdea } from './answer';
import type { Comment } from './comments';

export interface Converted {
  /** Notes on the commented move. */
  readonly move: readonly Note[];
  /** Notes on the position before it. */
  readonly before: readonly Note[];
  /** Ideas the model wrote that the lesson keeps. */
  readonly kept: number;
  readonly rejected: readonly { readonly idea: AnswerIdea; readonly why: string }[];
}

/**
 * `answer` for `comment` as notes, checked in `positions`. `own` is the
 * importer's ideas on the move's note: they join the model's first note on the
 * move. Ideas repeating anything in `comment.extracted` (those, plus the
 * importer's notes on other positions) are dropped.
 */
export function convertedNotes(
  comment: Comment,
  answer: Answer,
  positions: { readonly before: Chess; readonly after: Chess },
  own: readonly Idea[],
): Converted {
  const rejected: { idea: AnswerIdea; why: string }[] = [];
  const extractedEvaluation = comment.extracted.some((idea) => idea.type === 'evaluation');
  let kept = 0;
  const notesAbout = (about: 'move' | 'before') =>
    answer.notes
      .filter((note) => note.about === about)
      .map((note): Note => {
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
        return lessonNote(noteText(note.text), comment.comment, ideas);
      })
      .filter((note) => note.text);
  const before = notesAbout('before');
  const [first, ...rest] = notesAbout('move');
  const move =
    own.length === 0
      ? [first, ...rest].filter(Boolean)
      : [lessonNote(first?.text ?? noteText(comment.comment), comment.comment, [...own, ...(first?.ideas ?? [])]), ...rest];
  return { move, before, kept, rejected };
}

/** The note's text without a label the card already shows, cut to the word limit. */
function noteText(text: string): string {
  const plain = text.trim().replace(/^(?:Plan|Trap|Threat|Idea|Line)\s*:\s*/i, '');
  return plain.split(/\s+/).filter(Boolean).length > MAX_NOTE_WORDS ? shorten(plain) : plain;
}

function lessonNote(text: string, original: string, ideas: readonly Idea[]): Note {
  return { text, ...(text !== original && { original }), ...(ideas.length > 0 && { ideas }) };
}

/**
 * `raw` as a lesson idea in `pos`, or why it is dropped: a move that is not
 * legal, a rule from the spike (a threat by the side to move, an evaluation
 * where the importer already read one), or the checker's verdict.
 */
function lessonIdea(raw: AnswerIdea, pos: Chess, extractedEvaluation: boolean): Idea | string {
  try {
    const idea = withUci(raw, pos);
    if (idea.type === 'threat' && idea.side === pos.turn) return 'a threat is never a move by the side to move';
    if (idea.type === 'evaluation' && extractedEvaluation) return 'an evaluation was already extracted';
    return checkIdea(idea, pos) ?? idea;
  } catch (error) {
    if (error instanceof IllegalSan) return error.message;
    throw error;
  }
}

class IllegalSan extends Error {}

/** `san` in `pos` as UCI. */
function uci(pos: Chess, san: string): Uci {
  return sanToUci(pos, san) ?? fail(`${san} is not legal for ${pos.turn} here`);
}

function fail(message: string): never {
  throw new IllegalSan(message);
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

function withUci(raw: AnswerIdea, pos: Chess): Idea {
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
      return { ...raw, moves: line(pos, raw.moves) } as Idea;
    case 'structure':
      return { ...raw, features: raw.features.map((feature) => structureFeature(feature, pos, raw.side)) };
    default:
      return raw;
  }
}

function structureFeature(feature: AnswerFeature, pos: Chess, side: Chess['turn']): StructureFeature {
  if (feature.kind !== 'pawnBreak') return feature;
  return { kind: 'pawnBreak', move: uci(withTurn(pos, side), feature.move) };
}
