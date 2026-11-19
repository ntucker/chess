/**
 * "Choice guide:" comments, which say when to pick each of the learner's
 * good moves and how risky it is. Every move a guide offers is a book move.
 */
import type { Color } from 'chessops/types';

import { RISKS, type Risk } from '@/lesson/lesson';

import type { StudyMove } from './study';
import { namedMoves } from './text';

export interface Choice {
  readonly move: StudyMove;
  readonly risk?: Risk;
}

/** Clauses that name a move to stay away from, not to choose. */
const WARNING = /\b(?:avoid|warning|gamble|refut|loses|not yours)/i;
const RISK_WORDS: Readonly<Record<string, Risk>> = {
  low: 'safe',
  safe: 'safe',
  medium: 'balanced',
  balanced: 'balanced',
  high: 'sharp',
  higher: 'sharp',
  sharp: 'sharp',
  sharper: 'sharp',
};
const RISK = /\b(low|medium|high|higher)[- ]risk\b|\b(safe|balanced|sharp|sharper)\b/gi;
/** After "Risk level:" the bare words count too. */
const RISK_LEVEL = /\b(low|medium|high)\b|\b(safe|balanced|sharp)\b/gi;

/**
 * The learner's moves `move`'s choice guide offers, from among the moves the
 * guide could mean: `move` and its alternatives when it is the learner's, or
 * the replies to it when it is the opponent's. Only numbered moves and "this"
 * count; the sentences from "After ..." on describe what follows, not options.
 */
export function choiceGuide(move: StudyMove, learner: Color): Choice[] {
  const guide = move.comment.match(/Choice guide:\s*(.*)/s)?.[1];
  if (!guide) return [];
  const options = move.before.turn === learner ? (move.parent?.children ?? [move]) : move.children;
  const level = riskOf(move.comment.match(/Risk level:\s*([^.]+)/)?.[1] ?? '', RISK_LEVEL);
  const choices = new Map<StudyMove, Risk | undefined>();
  for (const clause of clauses(guide.split(/(?:^|\.\s+)After\s/)[0])) {
    if (WARNING.test(clause)) continue;
    const risk = riskOf(clause);
    const named = namedMoves(clause).filter((m) => m.ply !== undefined && m.side === learner);
    const targets = options.filter((option) => named.some((m) => m.san === option.san));
    if (/\bchoose this\b/i.test(clause) && move.before.turn === learner) targets.push(move);
    for (const target of targets) choices.set(target, risk ?? choices.get(target));
  }
  if (choices.has(move) && !choices.get(move)) choices.set(move, level);
  return [...choices].map(([target, risk]) => (risk ? { move: target, risk } : { move: target }));
}

function clauses(text: string): string[] {
  return text.split(/(?<=[.;?])\s+|(?=\bchoose\b)/i).filter((clause) => clause.trim());
}

/** The riskiest level `text` names: "low to medium" is balanced. */
function riskOf(text: string, words = RISK): Risk | undefined {
  let riskiest: Risk | undefined;
  for (const match of text.matchAll(words)) {
    const risk = RISK_WORDS[(match[1] ?? match[2]).toLowerCase()];
    if (!riskiest || RISKS.indexOf(risk) > RISKS.indexOf(riskiest)) riskiest = risk;
  }
  return riskiest;
}
