/**
 * The model's answer for one book move as a lesson note, or why it is
 * refused. A generated note has no study author behind it, so it is held to
 * more than a converted comment: any drawing the checker refuses, a threat
 * that wins nothing, a verdict, notation or an over-long text refuses the
 * whole note rather than leaving a claim in its words.
 */
import type { Chess } from 'chessops/chess';
import { parseSan } from 'chessops/san';
import { parseUci } from 'chessops/util';
import type { NormalMove } from 'chessops/types';

import { balance, VALUES } from '@/game/material';
import { parsePosition } from '@/game/replay';
import { noteTextProblem, withTurn } from '@/lesson/check';
import type { Idea, Note, Threat } from '@/lesson/lesson';

import type { Answer } from '../convert/answer';
import { lessonIdea } from '../convert/notes';
import type { BookMove } from './items';
import { EXPLAIN_IDEAS } from './prompt';

/**
 * A note text saying who is better, which a generated note never does: any
 * such word, stricter than ./unexplained.ts's VERDICT, which finds a guide's
 * note that says nothing else.
 */
const VERDICT =
  /\b(?:equal(?:ity)?|better|worse|advantage|edge)\b|\b(?:is|are|stands?) (?:winning|losing)\b/i;
/** Winning material in a clause: "wins the pawn back", "winning a rook for a bishop". */
const WIN =
  /\b(?:win|wins|won|winning|regain|regains|regaining)\b(?:\s+\S+){0,3}?\s+(?:pawn|piece|knight|bishop|rook|queen|exchange|material|back)\b/i;
/** Words that make a win the opponent's, or one still to come ("ready to win it back"). */
const NOT_NOW =
  /\b(?:white|black|white's|black's|it|to|can|could|will|would|must|may|later|next|threatens?|aims?|aiming|ready)\b/i;

/**
 * Whether `text` says the learner's move wins material now: "Your knight wins
 * the pawn back", "Taking with the knight wins the pawn back". Not a win the
 * opponent makes, one still to come, or one that depends on an "if".
 */
function claimsWin(text: string): boolean {
  if (/\bif\b/i.test(text)) return false;
  return text.split(/[,;:]|\band\b/i).some((clause) => WIN.test(clause) && !NOT_NOW.test(clause));
}
/** A note text saying the learner is ahead on material: "leaving you a pawn up", "your extra pawn". */
const AHEAD =
  /\b(?:you|you're|leaving you|keeps you)\b[^.,;]*?\b(?:(?:pawn|piece|exchange) (?:up|ahead)|extra (?:pawn|piece))\b|\byour extra (?:pawn|piece)\b/i;

/** A book move as the guards read it: the boards around it and Stockfish's reply. */
type Played = Pick<BookMove, 'fenBefore' | 'fenAfter' | 'engine'>;

export type Explained =
  | { readonly note: Note }
  | { readonly refused: { readonly text: string; readonly why: string } }
  /** The model found no idea it was sure of. */
  | { readonly none: true };

/** `answer` as the note on the book move `move`. */
export function explainedNote(answer: Answer, move: Played): Explained {
  const after = parsePosition(move.fenAfter)!;
  const [written] = answer.notes.filter((note) => note.about === 'move');
  if (!written) return { none: true };
  const text = written.text.trim();
  const refuse = (why: string): Explained => ({ refused: { text, why } });
  if (!text) return { none: true };
  const wording = noteTextProblem(text);
  if (wording) return refuse(`it ${wording}`);
  if (VERDICT.test(text)) return refuse('it says who is better');
  const { gain, lead } = material(move);
  // The reply's SAN stays out of why: the refusal is part of a retry's stored
  // key, and Stockfish's reply can differ between machines.
  if (claimsWin(text) && gain <= 0)
    return refuse(
      'it says you win material, but after the opponent’s best reply you are no more ahead than before',
    );
  if (AHEAD.test(text) && lead <= 0)
    return refuse(
      'it says you are ahead on material, but after the opponent’s best reply you are not',
    );
  const ideas: Idea[] = [];
  for (const raw of written.ideas) {
    if (!(EXPLAIN_IDEAS as readonly string[]).includes(raw.type))
      return refuse(`it draws a ${raw.type}, which a generated note never does`);
    // Evaluations are refused above, so whether one was extracted doesn't matter.
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
 * The learner's material once the opponent has made Stockfish's reply to
 * `move`: its `lead` in points, and its `gain` over the position before the
 * move (a recapture after a trade gains nothing back).
 */
function material({ fenBefore, fenAfter, engine }: Played) {
  const before = parsePosition(fenBefore)!;
  const settled = parsePosition(fenAfter)!;
  const reply = engine.reply && parseSan(settled, engine.reply);
  if (reply) settled.play(reply);
  const lead = balance(settled.board, before.turn);
  return { lead, gain: lead - balance(before.board, before.turn) };
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
