/**
 * The opportunity finder: where a real opponent is likely to play a bad move.
 * An opportunity is taught in three acts: the setup (the line to a position
 * where the erring side moves), the cue (its mistake, and the replies that
 * punish it) and the payoff (play on until the win is obvious).
 *
 * `findOpportunities` is a pure function of the answers the host has so far,
 * like the review's `nextSearch`: it returns the finds those answers confirm
 * and the answers still missing, most useful first. The host gets one or more
 * of them and asks again; there is no queue to keep in step. The import script
 * answers from lichess and Node Stockfish, the app from its store.
 */
import { judgement, MISTAKE_LOSS, moveLoss } from '@/analysis/quality';
import {
  type Analysis,
  type FinalAnalysis,
  forSide,
  isFinal,
  scoreFor,
  sketchOnly,
} from '@/evaluation/evaluation';
import type { Color } from '@/game/replay';
import type { PositionKey, Uci } from '@/lesson/lesson';
import { LikeliestFirst } from '@/lesson/likeliestFirst';

import { gainIfKnown } from './gain';
import { type Limits, LIMITS } from './limits';
import { type Disagreement, payoff } from './payoff';
import {
  type Answers,
  punishingLoss,
  type Context,
  legalChild,
  type Node,
  type Request,
  resultAt,
  type Spot,
  walkTo,
} from './walk';

/** A confirmed opportunity. Everything here is derived from the answers. */
export interface Find {
  /** Act I: the moves from the start to the position where the erring side moves. */
  readonly line: readonly Uci[];
  /** The erring side's mistake. */
  readonly mistake: Uci;
  /** The punishing replies the cue accepts (`acceptedReplies`), best first. */
  readonly replies: readonly Uci[];
  /** Act III: the moves after the best reply (`payoff`). */
  readonly payoff: readonly Uci[];
  /** Where the guide and Stockfish differ for the punishing side in Act III (`Payoff`), indexing `payoff`. */
  readonly disagreements: readonly Disagreement[];
  /** The punishing side's expected score (0 to 1) where Act III ends. */
  readonly end: number;
  /** Whether the cue's best reply alone keeps the learner clearly better, against best defence. */
  readonly holds: boolean;
  /** The share of games that reach the position: the erring side's shares along the line. */
  readonly reach: number;
  /** The mistake's share of the games at its position. */
  readonly share: number;
  /** The expected score (0 to 1) the mistake gives away, from full searches; shown, not ranked. */
  readonly cost: number;
  /** The share of games at the cue that play an accepted reply; absent where the cue is thin. */
  readonly found?: number;
  /** What knowing the cue is worth per game at it (`gainIfKnown`). */
  readonly gain: number;
  /** Set where the gain is an estimate: the cue is thin, or its measured replies cover under half. */
  readonly estimate?: true;
  /** reach × share × gain: the expected score knowing the opportunity is worth per game. */
  readonly score: number;
}

export interface FinderInput {
  /** Where the line starts, as a FEN. */
  readonly start: string;
  /** The moves from `start` to where the finder opens. */
  readonly line: readonly Uci[];
  /** The side looking for opportunities: the one that punishes. */
  readonly side: Color;
  readonly answers: Answers;
  readonly limits?: Partial<Limits>;
}

/** A position where the walk ended because it is thin, and the share of games that reach it. */
export type ThinEnd = Pick<Node, 'line' | 'key' | 'reach'>;

export interface FinderResult {
  /** Best first (`byScore`), each leaving the learner clearly better where Act III ends. */
  readonly finds: readonly Find[];
  /** Finds where Act III ends short of clearly better (`keepScore`), best first. */
  readonly dropped: readonly Find[];
  /** Where the walk ended thin, most reached first. */
  readonly thin: readonly ThinEnd[];
  /** The answers still missing, most useful first. Empty once the walk is done. */
  readonly requests: readonly Request[];
}

/**
 * The opportunities the answers so far confirm, and the answers still
 * missing. The walk goes from where the finder opens, most reached position
 * first. Where the erring side moves, every reply over the share floor is
 * screened with a sketch; one at or over the mistake limit is confirmed with
 * full searches of the positions before and after it, and becomes a find once
 * its cue's replies and its payoff are known. Other replies go on, as does the
 * punishing side's move (its own moves, else Stockfish's best). The walk stops
 * where the game is over, at thin positions, below the reach floor and past
 * the ply cap; a position reached again adds nothing, and so does a second
 * find of one cue.
 */
export function findOpportunities({
  start,
  line,
  side,
  answers,
  limits: given,
}: FinderInput): FinderResult {
  const limits = { ...LIMITS, ...given };
  const requests: Request[] = [];
  const asked = new Set<string>();
  const ask = (kind: Request['kind'], spot: Spot) => {
    const id = `${kind} ${spot.key}`;
    if (asked.has(id)) return;
    asked.add(id);
    requests.push({ kind, spot: { line: spot.line, key: spot.key } });
  };
  const context: Context = { side, answers, limits, ask };

  const opening = walkTo(start, line);
  if (!opening) throw new Error(`The finder's start line isn't legal: ${start} ${line.join(' ')}`);
  const lastPly = line.length + limits.maxPlies;
  // Most reached first, then in the order added.
  const frontier = new LikeliestFirst<Node>((node) => node.reach);
  frontier.push(opening);
  const visited = new Set<PositionKey>();
  const finds = new Map<PositionKey, Find>();
  const thin: ThinEnd[] = [];

  for (let node = frontier.pop(); node; node = frontier.pop()) {
    if (visited.has(node.key) || node.line.length > lastPly || resultAt(node)) continue;
    visited.add(node.key);
    if (node.pos.turn === side) {
      for (const uci of punishingMoves(node, context)) {
        frontier.push(legalChild(node, uci, node.reach));
      }
      continue;
    }
    const steps = erringSteps(node, context);
    if (steps === 'thin') {
      thin.push({ line: node.line, key: node.key, reach: node.reach });
      continue;
    }
    for (const step of steps) {
      if ('find' in step) {
        if (!finds.has(step.cue)) finds.set(step.cue, step.find);
      } else if (step.reach >= limits.reachFloor) frontier.push(step);
    }
  }
  const sorted = [...finds.values()].sort(byScore);
  const kept = (find: Find) => find.end >= limits.keepScore;
  return {
    finds: sorted.filter(kept),
    dropped: sorted.filter((find) => !kept(find)),
    thin,
    requests,
  };
}

/** The punishing side's moves at `node`: the guide's, else Stockfish's best; none until known. */
function punishingMoves(node: Node, { answers, ask }: Context): readonly Uci[] {
  const guide = answers.guideMoves?.(node);
  if (guide?.length) return guide;
  const analysis = sketchOnly(answers.analysis(node));
  if (!analysis) {
    ask('sketch', node);
    return [];
  }
  const best = analysis.lines[0]?.uci;
  return best ? [best] : [];
}

/** Where the erring side moves: a reply's position to walk on from, or a find keyed by its cue. */
type ErringStep = Node | { readonly cue: PositionKey; readonly find: Find };

/**
 * The erring side's replies at `node` over the share floor, most played
 * first: each a find once confirmed, or a reply to walk on from. A reply
 * still being judged is neither. `'thin'` where the position is.
 */
function erringSteps(node: Node, context: Context): ErringStep[] | 'thin' {
  const { answers, limits, ask } = context;
  const replies = answers.replies(node);
  if (!replies) {
    ask('replies', node);
    return [];
  }
  if (replies.thin) return 'thin';
  const played = Object.entries(replies.shares)
    .filter(([, share]) => share >= limits.shareFloor)
    .sort(([, a], [, b]) => b - a);
  const before = sketchOnly(answers.analysis(node));
  if (!before) {
    ask('sketch', node);
    return [];
  }
  return played.flatMap(([uci, share]): ErringStep[] => {
    // A move that ends the game leaves nothing to punish, and no line to walk on.
    const cue = legalChild(node, uci, node.reach * share);
    if (resultAt(cue)) return [];
    const after = sketchOnly(answers.analysis(cue));
    if (!after) {
      ask('sketch', cue);
      return [];
    }
    const screened = moveLoss(before, after, uci, node.pos.turn);
    if (!screened || screened.loss < MISTAKE_LOSS) return [cue];
    const find = confirm({ node, before }, { cue, after }, share, context);
    if (find === 'pending') return [];
    return find ? [{ cue: cue.key, find }] : [cue];
  });
}

/**
 * The find the mistake into `cue` makes once full searches confirm it:
 * undefined if they don't, `'pending'` while an answer is missing.
 */
function confirm(
  { node, before }: { node: Node; before: Analysis },
  { cue, after }: { cue: Node; after: Analysis },
  share: number,
  context: Context,
): Find | undefined | 'pending' {
  const { side, answers, limits, ask } = context;
  if (!isFinal(before)) ask('full', node);
  if (!isFinal(after)) ask('full', cue);
  if (!isFinal(before) || !isFinal(after)) return 'pending';
  const mistake = cue.line.at(-1)!;
  const cost = moveLoss(before, after, mistake, node.pos.turn)!.loss;
  if (cost < MISTAKE_LOSS) return undefined;
  const replies = acceptedReplies(before, after, side);
  const played = answers.replies(cue);
  if (!played) ask('replies', cue);
  const best = legalChild(cue, replies[0], 0);
  const rest = payoff(best, { before, cue: after }, context);
  const losses = played && replyLosses(cue, after, played.shares, context);
  if (!played || !rest || !losses) return 'pending';
  const found = played.thin
    ? undefined
    : replies.reduce((sum, uci) => sum + (played.shares[uci] ?? 0), 0);
  const { gain, covered } = gainIfKnown(played.shares, losses);
  return {
    line: node.line,
    mistake,
    replies,
    payoff: rest.moves,
    disagreements: rest.disagreements,
    end: rest.end,
    holds: scoreFor(after.lines[0].evaluation, side) >= limits.keepScore,
    reach: node.reach,
    share,
    cost,
    ...(found !== undefined && { found }),
    gain,
    ...((played.thin || covered < limits.estimateCoverage) && { estimate: true as const }),
    score: node.reach * share * gain,
  };
}

/**
 * Each reply the band plays at the cue over the share floor, with what it
 * gives away beside the best (`moveLoss`); undefined while a reply the cue's
 * analysis doesn't list awaits its full search.
 */
function replyLosses(
  cue: Node,
  after: FinalAnalysis,
  shares: Readonly<Record<Uci, number>>,
  context: Context,
): Record<Uci, number> | undefined {
  const losses: Record<Uci, number> = {};
  let pending = false;
  for (const [uci, share] of Object.entries(shares)) {
    if (share < context.limits.shareFloor) continue;
    const judged = punishingLoss(cue, after, uci, context);
    if (judged === 'pending') pending = true;
    else if (judged) losses[uci] = judged.loss;
  }
  return pending ? undefined : losses;
}

/**
 * The replies the cue accepts, from its final analysis `after`: the moves it
 * lists that label best or good and still gain at least the mistake limit
 * beside `before`, the final analysis of the position before the mistake.
 * The best one always counts, so a cue has one even when the two searches
 * disagree a little.
 */
export function acceptedReplies(before: FinalAnalysis, after: FinalAnalysis, side: Color): Uci[] {
  const base = forSide(before.lines[0].evaluation.score, side);
  return after.lines.flatMap(({ uci, evaluation }, rank) => {
    if (!uci) return [];
    const quality = judgement(after, undefined, uci, side)?.quality;
    const good = quality === 'best' || quality === 'good';
    const kept = forSide(evaluation.score, side) - base >= MISTAKE_LOSS;
    return rank === 0 || (good && kept) ? [uci] : [];
  });
}

/** Higher score first; on a tie, the more reached, then by line, so the order is stable. */
export const byScore = (a: Find, b: Find) =>
  b.score - a.score ||
  b.reach - a.reach ||
  [...a.line, a.mistake].join(' ').localeCompare([...b.line, b.mistake].join(' '));
