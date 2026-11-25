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
  type Replies,
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
  /** The share of games that reach the position before the mistake (`reachOf`). */
  readonly reach: number;
  /**
   * Whether the guide's moves alone lead the punishing side here. Only such
   * a find goes into a lesson; the rest are evidence for a later finder that
   * opens anywhere.
   */
  readonly onGuide: boolean;
  /** The guide's move at the cue where the cue doesn't accept it (`acceptedReplies`): a person looks at it. */
  readonly guideReply?: Uci;
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
  /**
   * The share of games that reach the cue (`reachOf`) × gain: the expected
   * score knowing the opportunity is worth per game.
   */
  readonly score: number;
}

/** A find before the walk is done: what depends on every move order that reaches it comes last. */
type Confirmed = Omit<Find, 'reach' | 'onGuide' | 'score'>;

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
  /** Finds on the guide, best first (`byScore`), each leaving the learner clearly better where Act III ends. */
  readonly finds: readonly Find[];
  /** Finds on the guide where Act III ends short of clearly better (`keepScore`), best first. */
  readonly dropped: readonly Find[];
  /** Finds off the guide, kept or not, best first: evidence only, never written into a lesson. */
  readonly offGuide: readonly Find[];
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
 * punishing side's move (its own moves, else Stockfish's best). A mistake
 * whose punishment nearly everyone finds (gain under `minGain`) is no find,
 * and the walk goes on past it. The walk stops where the game is over, at
 * thin positions, below the reach floor and past the ply cap; a position
 * reached again is not walked again, though its reach counts every way in
 * (`reachOf`), and a cue several mistakes lead to is one find.
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
  const moves: Move[] = [];
  const finds = new Map<PositionKey, { confirmed: Confirmed; from: PositionKey }[]>();
  const thinKeys = new Map<PositionKey, readonly Uci[]>();

  for (let node = frontier.pop(); node; node = frontier.pop()) {
    if (visited.has(node.key) || node.line.length > lastPly || resultAt(node)) continue;
    visited.add(node.key);
    if (node.pos.turn === side) {
      const { ucis, guided } = punishingMoves(node, context);
      for (const uci of ucis) {
        const next = legalChild(node, uci, node.reach);
        moves.push({ from: node.key, to: next.key, share: 1, guided, chosen: true });
        frontier.push(next);
      }
      continue;
    }
    const steps = erringSteps(node, context);
    if (steps === 'thin') {
      thinKeys.set(node.key, node.line);
      continue;
    }
    for (const { next, share, confirmed } of steps) {
      moves.push({ from: node.key, to: next.key, share, guided: true, chosen: false });
      if (confirmed) {
        append(finds, next.key, { confirmed, from: node.key });
      } else if (next.reach >= limits.reachFloor) frontier.push(next);
    }
  }
  const reach = reachOf(opening.key, moves);
  const sorted = [...finds]
    .map(([cue, ways]): Find => {
      // On the guide if the guide's moves alone lead to one of its mistakes.
      const onGuide = ways.some(({ from }) => reach(from, true) > 0);
      const games = (key: PositionKey) => reach(key, onGuide);
      // A cue several mistakes lead to is one find, shown by the one most games
      // play (on the guide, one the guide leads to).
      const played = ({ confirmed, from }: (typeof ways)[number]) => games(from) * confirmed.share;
      const { confirmed, from } = ways.reduce((most, way) =>
        played(way) > played(most) ? way : most,
      );
      return { ...confirmed, reach: games(from), onGuide, score: games(cue) * confirmed.gain };
    })
    .sort(byScore);
  const thin = [...thinKeys]
    .map(([key, line]) => ({ line, key, reach: reach(key, false) }))
    .sort((a, b) => b.reach - a.reach);
  const kept = (find: Find) => find.end >= limits.keepScore;
  const guided = sorted.filter((find) => find.onGuide);
  return {
    finds: guided.filter(kept),
    dropped: guided.filter((find) => !kept(find)),
    offGuide: sorted.filter((find) => !find.onGuide),
    thin,
    requests,
  };
}

/** One move the walk took: between which positions, and its share of the games where it is played (1 for a chosen move). */
export interface Move {
  readonly from: PositionKey;
  readonly to: PositionKey;
  readonly share: number;
  /** Whether a move order through it stays on the guide: the guide's punishing-side move, or any erring-side reply. */
  readonly guided: boolean;
  /** The punishing side's move: chosen, not a share of games, so its position takes its most reached move, not their sum. */
  readonly chosen: boolean;
}

/**
 * Each walked position's reach: the share of games that get there when the
 * punishing side steers toward it. Erring-side replies add up, weighted by
 * share, while the punishing side plays whichever of its moves gets there
 * most, so two book moves that meet again count their games once. Only move
 * orders of fewest moves count, so a repetition or a lost tempo adds nothing
 * and the start stays 1. With `onGuide`, only guided moves count
 * (`Move.guided`), fewest among them. Reach stays derived: nothing stores it.
 */
export function reachOf(start: PositionKey, moves: readonly Move[]) {
  const all = reachOver(start, fewestMoves(start, moves));
  const guided = reachOver(
    start,
    fewestMoves(
      start,
      moves.filter((move) => move.guided),
    ),
  );
  return (key: PositionKey, onGuide: boolean) => (onGuide ? guided : all)(key);
}

/** Each position's reach over `fewest`, worked out the first time it is asked for. */
function reachOver(start: PositionKey, fewest: readonly Move[]) {
  const known = new Map<PositionKey, number>();
  return (key: PositionKey) => {
    let reach = known.get(key);
    if (reach === undefined) {
      reach = steeredReach(start, key, fewest);
      known.set(key, reach);
    }
    return reach;
  };
}

/**
 * The share of games that reach `target` from `start` when the punishing side
 * steers toward it, worked back from `target` (1) over `fewest`, whose
 * breadth-first order puts every move out of a position after every move into
 * it: so read backwards, each position's moves come before any move into it.
 */
function steeredReach(start: PositionKey, target: PositionKey, fewest: readonly Move[]): number {
  const reach = new Map([[target, 1]]);
  for (let i = fewest.length - 1; i >= 0; i--) {
    const move = fewest[i];
    const through = (reach.get(move.to) ?? 0) * move.share;
    if (!through) continue;
    const before = reach.get(move.from) ?? 0;
    reach.set(move.from, move.chosen ? Math.max(before, through) : before + through);
  }
  return reach.get(start) ?? 0;
}

/**
 * The moves that go one deeper than the fewest moves to where they start,
 * breadth-first from `start`, so each comes after every move into the
 * position it leaves.
 */
function fewestMoves(start: PositionKey, moves: readonly Move[]): Move[] {
  const out = new Map<PositionKey, Move[]>();
  for (const move of moves) append(out, move.from, move);
  const order = [start];
  const depth = new Map([[start, 0]]);
  const fewest: Move[] = [];
  for (const key of order) {
    const next = depth.get(key)! + 1;
    for (const move of out.get(key) ?? []) {
      if (!depth.has(move.to)) {
        depth.set(move.to, next);
        order.push(move.to);
      }
      if (depth.get(move.to) === next) fewest.push(move);
    }
  }
  return fewest;
}

/** Adds `value` to `map`'s list at `key`, starting the list where there is none. */
function append<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/**
 * The punishing side's moves at `node`, and whether the guide gave them: the
 * guide's, else Stockfish's best; none until known.
 */
function punishingMoves(
  node: Node,
  { answers, ask }: Context,
): { ucis: readonly Uci[]; guided: boolean } {
  const guide = answers.guideMoves?.(node);
  if (guide?.length) return { ucis: guide, guided: true };
  const analysis = sketchOnly(answers.analysis(node));
  if (!analysis) {
    ask('sketch', node);
    return { ucis: [], guided: false };
  }
  const best = analysis.lines[0]?.uci;
  return { ucis: best ? [best] : [], guided: false };
}

/** A reply where the erring side moves: its position and share, and the find it makes once confirmed (else the walk goes on from it). */
interface ErringStep {
  readonly next: Node;
  readonly share: number;
  readonly confirmed?: Confirmed;
}

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
    const walkOn = [{ next: cue, share }];
    const after = sketchOnly(answers.analysis(cue));
    if (!after) {
      ask('sketch', cue);
      return [];
    }
    const screened = moveLoss(before, after, uci, node.pos.turn);
    if (!screened || screened.loss < MISTAKE_LOSS) return walkOn;
    const confirmed = confirm({ node, before }, { cue, after }, share, context);
    if (confirmed === 'pending') return [];
    return confirmed && worthKnowing(confirmed, limits)
      ? [{ next: cue, share, confirmed }]
      : walkOn;
  });
}

/**
 * Whether knowing the punishment is worth a find: its gain reaches
 * `minGain`, or the gain is only an estimate (a thin cue, or too few of its
 * replies measured), which isn't enough to rule it out.
 */
const worthKnowing = ({ gain, estimate }: Confirmed, { minGain }: Limits) =>
  estimate || gain >= minGain;

/**
 * The find the mistake into `cue` makes once full searches confirm it:
 * undefined if they don't, `'pending'` while an answer is missing.
 */
function confirm(
  { node, before }: { node: Node; before: Analysis },
  { cue, after }: { cue: Node; after: Analysis },
  share: number,
  context: Context,
): Confirmed | undefined | 'pending' {
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
  const known = played && cueGain(cue, after, played, context);
  if (!played || !rest || !known) return 'pending';
  const found = played.thin
    ? undefined
    : replies.reduce((sum, uci) => sum + (played.shares[uci] ?? 0), 0);
  const { gain, estimate } = known;
  const guideReply = answers.guideMoves?.(cue)?.[0];
  return {
    line: node.line,
    mistake,
    replies,
    payoff: rest.moves,
    disagreements: rest.disagreements,
    end: rest.end,
    holds: scoreFor(after.lines[0].evaluation, side) >= limits.keepScore,
    ...(guideReply !== undefined && !replies.includes(guideReply) && { guideReply }),
    share,
    cost,
    ...(found !== undefined && { found }),
    gain,
    ...(estimate && { estimate: true as const }),
  };
}

/**
 * What knowing the cue is worth where its band plays `played` there
 * (`gainIfKnown`), from `after`, the cue's final analysis, and whether that
 * is an estimate (Rules); undefined while a reply awaits its full search.
 * The importer calls it again for each band's replies at a find's cue.
 */
export function cueGain(
  cue: Node,
  after: FinalAnalysis,
  played: Replies,
  context: Context,
): { readonly gain: number; readonly estimate: boolean } | undefined {
  const losses = replyLosses(cue, after, played.shares, context);
  if (!losses) return undefined;
  const { gain, covered } = gainIfKnown(played.shares, losses);
  return { gain, estimate: played.thin || covered < context.limits.estimateCoverage };
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
