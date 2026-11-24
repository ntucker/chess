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
import { judgement, moveLoss } from '@/analysis/quality';
import { type Analysis, type FinalAnalysis, forSide, isFinal } from '@/evaluation/evaluation';
import type { Color } from '@/game/replay';
import type { PositionKey, Uci } from '@/lesson/lesson';
import { LikeliestFirst } from '@/lesson/likeliestFirst';
import { sketched } from '@/review/order';

import { type Limits, LIMITS } from './limits';
import { payoff } from './payoff';
import {
  type Answers,
  child,
  type Context,
  type Node,
  type Request,
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
  /** The share of games that reach the position: the erring side's shares along the line. */
  readonly reach: number;
  /** The mistake's share of the games at its position. */
  readonly share: number;
  /** The expected score (0 to 1) the mistake gives away, from full searches. */
  readonly cost: number;
  /** The share of games at the cue that play an accepted reply; absent where the cue is thin. */
  readonly found?: number;
  /** reach × share × cost: the expected score the opportunity is worth per game. */
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
  /** Best first (`byScore`). */
  readonly finds: readonly Find[];
  /** Where the walk ended thin, most reached first. */
  readonly thin: readonly ThinEnd[];
  /** The answers still missing, most useful first. Empty once the walk is done. */
  readonly requests: readonly Request[];
}

/**
 * The opportunities the answers so far confirm, and the answers still
 * missing. The walk goes from where the finder opens, most reached position
 * first. Where the erring side moves, every reply over the share floor is
 * screened with a sketch; one at or over the cost floor is confirmed with full
 * searches of the positions before and after it, and becomes a find once its
 * cue's replies and its payoff are known. Other replies go on, as does the
 * punishing side's move (its own moves, else Stockfish's best). The walk
 * stops at thin positions, below the reach floor and past the ply cap; a
 * position reached again adds nothing, and so does a second find of one cue.
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
  if (!opening) return { finds: [], thin: [], requests: [] };
  const lastPly = line.length + limits.maxPlies;
  // Most reached first, then in the order added.
  const frontier = new LikeliestFirst<Node>((node) => node.reach);
  frontier.push(opening);
  const visited = new Set<PositionKey>();
  const finds = new Map<PositionKey, Find>();
  const thin: ThinEnd[] = [];

  for (let node = frontier.pop(); node; node = frontier.pop()) {
    if (visited.has(node.key) || node.line.length >= lastPly) continue;
    visited.add(node.key);
    if (node.pos.turn === side) {
      for (const uci of punishingMoves(node, context)) {
        const next = child(node, uci, node.reach);
        if (next) frontier.push(next);
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
  return { finds: [...finds.values()].sort(byScore), thin, requests };
}

/** The punishing side's moves at `node`: the guide's, else Stockfish's best; none until known. */
function punishingMoves(node: Node, { answers, ask }: Context): readonly Uci[] {
  const guide = answers.guideMoves?.(node);
  if (guide?.length) return guide;
  const analysis = answers.analysis(node);
  if (!sketched(analysis)) {
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
  const before = answers.analysis(node);
  if (!sketched(before)) {
    ask('sketch', node);
    return [];
  }
  return played.flatMap(([uci, share]): ErringStep[] => {
    const cue = child(node, uci, node.reach * share);
    if (!cue) return [];
    const after = answers.analysis(cue);
    if (!sketched(after)) {
      ask('sketch', cue);
      return [];
    }
    const screened = moveLoss(before, after, uci, node.pos.turn);
    if (!screened || screened.loss < limits.costFloor) return [cue];
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
  if (cost < limits.costFloor) return undefined;
  const replies = acceptedReplies(before, after, side, limits);
  const played = answers.replies(cue);
  if (!played) ask('replies', cue);
  const best = child(cue, replies[0], 0);
  const rest = best && payoff(best, context);
  if (!played || !rest) return 'pending';
  const found = played.thin
    ? undefined
    : replies.reduce((sum, uci) => sum + (played.shares[uci] ?? 0), 0);
  return {
    line: node.line,
    mistake,
    replies,
    payoff: rest,
    reach: node.reach,
    share,
    cost,
    ...(found !== undefined && { found }),
    score: node.reach * share * cost,
  };
}

/**
 * The replies the cue accepts, from its final analysis `after`: the moves it
 * lists that label best or good and still gain at least the cost floor
 * beside `before`, the final analysis of the position before the mistake.
 * The best one always counts, so a cue has one even when the two searches
 * disagree a little.
 */
export function acceptedReplies(
  before: FinalAnalysis,
  after: FinalAnalysis,
  side: Color,
  limits: Limits = LIMITS,
): Uci[] {
  const base = forSide(before.lines[0].evaluation.score, side);
  return after.lines.flatMap(({ uci, evaluation }, rank) => {
    if (!uci) return [];
    const quality = judgement(after, undefined, uci, side)?.quality;
    const good = quality === 'best' || quality === 'good';
    const kept = forSide(evaluation.score, side) - base >= limits.costFloor;
    return rank === 0 || (good && kept) ? [uci] : [];
  });
}

/** Higher score first; on a tie, the opportunity players find less often, unknown last. */
export const byScore = (a: Find, b: Find) =>
  b.score - a.score || (a.found ?? Infinity) - (b.found ?? Infinity);
