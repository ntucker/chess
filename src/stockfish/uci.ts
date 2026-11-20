import type { Evaluation } from '@/evaluation/evaluation';

// The parts of the UCI protocol (https://backscattered.github.io/uci/) the
// app uses: what to send for a position, and how to read the engine's score
// and moves out of the lines it prints while it searches.

/** A score as Stockfish reports it, from the side to move's point of view. */
export interface Score {
  readonly kind: 'cp' | 'mate';
  readonly value: number;
}

/**
 * One of the lines (principal variations) a search reports: with MultiPV
 * set to N, the engine reports its N best moves, ranked from 1, each time it
 * finishes a depth.
 */
export interface SearchLine {
  /** 1 for the best move, 2 for the next best, and so on. */
  readonly rank: number;
  /** How many moves deep the search has looked. */
  readonly depth: number;
  /** How many positions the search has visited so far. */
  readonly nodes: number;
  readonly score: Score;
  /** The line's first move (UCI), when the `info` line names one. */
  readonly move?: string;
  /**
   * The score is only a bound (`lowerbound`, `upperbound`): the search of
   * this line was cut short, by the node limit or a failed guess at its score.
   */
  readonly bound?: true;
}

/** The line an `info` line reports, or undefined for any other line. */
export function parseInfo(line: string): SearchLine | undefined {
  if (!line.startsWith('info ')) return undefined;
  const match = / depth (\d+)\b.* score (cp|mate) (-?\d+)\b/.exec(line);
  if (!match) return undefined;
  const [, depth, kind, value] = match;
  const rank = Number(/ multipv (\d+)\b/.exec(line)?.[1] ?? 1);
  const move = / pv (\S+)/.exec(line)?.[1];
  return {
    rank,
    depth: Number(depth),
    nodes: Number(/ nodes (\d+)\b/.exec(line)?.[1] ?? 0),
    score: { kind: kind as Score['kind'], value: Number(value) },
    ...(move && { move }),
    ...(/ (lower|upper)bound\b/.test(line) && { bound: true }),
  };
}

/**
 * The set of lines being printed, after the engine prints `info`. Stockfish
 * prints every rank together, best first, each time it finishes a depth, so
 * a rank-1 line starts a new set.
 */
export const addLine = (printing: readonly SearchLine[], info: SearchLine): SearchLine[] =>
  info.rank === 1 ? [info] : [...printing, info];

/**
 * Whether `set`, the lines a search printed together, is one whole depth the
 * search finished: `ranks` lines (the search's MultiPV, or fewer when fewer
 * moves are legal) all of one depth, every score exact, printed before the
 * search reached `nodeLimit`. The set printed when a search stops (at the
 * limit, or told to) fails: it mixes the depth being searched with the one
 * before (one line at depth 16, the others at 15), or repeats the last
 * depth's moves under the new depth's number, or holds a bound. Every other
 * set passes, and a search's passing sets are the same, in the same order,
 * whatever limit it ran to: a shorter search's are the start of a longer one's.
 */
export const isWholeDepth = (set: readonly SearchLine[], ranks: number, nodeLimit: number) =>
  set.length === ranks &&
  set.every(({ rank, depth, bound }, i) => rank === i + 1 && depth === set[0].depth && !bound) &&
  set[0].nodes < nodeLimit;

/** The command that has the engine rank its `ranks` best moves in each search. */
export const multiPvCommand = (ranks: number) => `setoption name MultiPV value ${ranks}`;

/**
 * The commands that set up the position after `line` (UCI moves from the
 * starting position, castling as the king's two-square move, `e1g1`, which is
 * how Stockfish writes it in standard chess).
 */
export function positionCommand(line: readonly string[]): string {
  return line.length ? `position startpos moves ${line.join(' ')}` : 'position startpos';
}

/**
 * `score` as an evaluation from White's side, for the position after `plies`
 * moves from the starting position. The expected score uses lichess's curve
 * for its evaluation bar: 50 + 50 * (2 / (1 + e^(-0.00368208 * centipawns)) - 1)
 * percent.
 */
export function evaluationFromScore(score: Score, plies: number): Evaluation {
  const sign = plies % 2 === 0 ? 1 : -1;
  if (score.kind === 'mate') {
    // "mate 0" means the side to move is mated; otherwise the sign says who mates.
    const winner = score.value > 0 ? sign : -sign;
    return { score: winner > 0 ? 1 : 0, pawns: 0, mate: winner * Math.abs(score.value) || 0 };
  }
  const pawns = (sign * score.value) / 100;
  return { score: 1 / (1 + Math.exp(-0.368208 * pawns)), pawns };
}

/** The shallowest depth whose lines `forwardNeededLines` passes on. */
export const FIRST_FORWARDED_DEPTH = 10;

/**
 * Wraps `onLine` to pass on only the lines the app needs from the engine: the
 * handshake (`uciok`), each search's `bestmove`, and its scored lines from
 * `FIRST_FORWARDED_DEPTH` on, which the app shows as the search deepens.
 * The engine runs in a web view on Android, and every line that crosses into
 * the app costs a trip across the bridge, so this runs where the engine
 * does: a search prints a few hundred lines, and about 30 cross. A search
 * that ends before that depth (a forced mate, one legal move) passes on its
 * last set.
 */
export function forwardNeededLines(onLine: (line: string) => void): (line: string) => void {
  let shallow: string[] = [];
  let forwarded = false;
  return (line) => {
    const info = parseInfo(line);
    if (info && info.depth >= FIRST_FORWARDED_DEPTH) {
      forwarded = true;
      onLine(line);
    } else if (info) shallow = info.rank === 1 ? [line] : [...shallow, line];
    else if (line === 'uciok') onLine(line);
    else if (line.startsWith('bestmove')) {
      if (!forwarded) shallow.forEach(onLine);
      shallow = [];
      forwarded = false;
      onLine(line);
    }
  };
}
