/**
 * The model's answer for one book move as a lesson note, or why it is
 * refused. A generated note has no study author behind it, so it is held to
 * more than a converted comment: any drawing the checker refuses, a threat
 * that wins nothing, a verdict, notation or an over-long text refuses the
 * whole note rather than leaving a claim in its words.
 */
import type { Chess } from 'chessops/chess';
import { parseUci } from 'chessops/util';
import type { NormalMove } from 'chessops/types';

import { VALUES } from '@/game/material';
import { notationProblem, withTurn } from '@/lesson/check';
import { MAX_NOTE_WORDS, type Idea, type Note, type Threat } from '@/lesson/lesson';

import type { Answer } from '../convert/answer';
import { lessonIdea } from '../convert/notes';
import { EXPLAIN_IDEAS } from './prompt';

/** A note text saying who is better, which a generated note never does. */
const VERDICT =
  /\b(?:equal(?:ity)?|better|worse|advantage|edge)\b|\b(?:is|are|stands?) (?:winning|losing)\b/i;

export type Explained =
  | { readonly note: Note }
  | { readonly refused: readonly { readonly text: string; readonly why: string }[] }
  /** The model found no idea it was sure of. */
  | { readonly none: true };

/** `answer` as the note on a book move whose position after it is `after`. */
export function explainedNote(answer: Answer, after: Chess): Explained {
  const [written] = answer.notes.filter((note) => note.about === 'move');
  if (!written) return { none: true };
  const text = written.text.trim();
  const refuse = (why: string): Explained => ({ refused: [{ text, why }] });
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words === 0) return { none: true };
  if (words > MAX_NOTE_WORDS) return refuse(`it has ${words} words (most ${MAX_NOTE_WORDS})`);
  const notation = notationProblem(text);
  if (notation) return refuse(`it ${notation}`);
  if (VERDICT.test(text)) return refuse('it says who is better');
  const ideas: Idea[] = [];
  for (const raw of written.ideas) {
    if (!(EXPLAIN_IDEAS as readonly string[]).includes(raw.type))
      return refuse(`it draws a ${raw.type}, which a generated note never does`);
    const idea = lessonIdea(raw, after, true);
    if (typeof idea === 'string') return refuse(`its ${raw.type} is false here: ${idea}`);
    if (idea.type === 'threat') {
      const empty = emptyThreat(idea, after);
      if (empty) return refuse(`its threat ${empty}`);
    }
    ideas.push(idea);
  }
  return { note: { text, generated: true, ...(ideas.length > 0 && { ideas }) } };
}

/**
 * Why `threat` in `pos` is no real threat, or undefined when it is: its move
 * mates, takes an undefended piece, or takes a piece worth at least two
 * points more than the piece taking it.
 */
export function emptyThreat(threat: Threat, pos: Chess): string | undefined {
  const threatening = withTurn(pos, threat.side);
  const move = parseUci(threat.move) as NormalMove;
  const mover = threatening.board.get(move.from)!;
  const taken = threatening.board.get(move.to);
  const after = threatening.clone();
  after.play(move);
  if (after.isCheckmate()) return undefined;
  if (!taken) return 'takes nothing and does not mate';
  const defended = after.kingAttackers(move.to, after.turn, after.board.occupied).nonEmpty();
  if (!defended) return undefined;
  const value = (role: string) => VALUES[role as keyof typeof VALUES] ?? Infinity;
  return value(taken.role) - value(mover.role) >= 2
    ? undefined
    : 'takes a defended piece and wins nothing';
}
