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
 * set to N, the engine reports its N best moves, ranked from 1.
 */
export interface SearchLine {
  /** 1 for the best move, 2 for the next best, and so on. */
  readonly rank: number;
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
  const match = / depth \d+\b.* score (cp|mate) (-?\d+)\b/.exec(line);
  if (!match) return undefined;
  const [, kind, value] = match;
  const rank = Number(/ multipv (\d+)\b/.exec(line)?.[1] ?? 1);
  const move = / pv (\S+)/.exec(line)?.[1];
  return {
    rank,
    score: { kind: kind as Score['kind'], value: Number(value) },
    ...(move && { move }),
    ...(/ (lower|upper)bound\b/.test(line) && { bound: true }),
  };
}

/**
 * A search's lines so far, best first, each kept as an `L`: one depth's
 * whole set. Stockfish prints every rank together, best first, each time
 * it finishes a depth or stops, so a rank-1 line starts a new set. Mixing
 * ranks from two sets could list a move twice.
 */
export interface RankedLines<L> {
  /** The last whole set whose scores are all exact. */
  readonly lines: readonly L[];
  /**
   * The set being printed, while its scores are all exact; undefined once
   * one turns out to be a bound (see `rankLine`), until the next set.
   */
  readonly printing?: readonly L[];
}

export const NO_LINES: RankedLines<never> = { lines: [] };

/**
 * `ranked` after the engine prints `info`, kept as `kept`. A set with a line
 * whose score is only a bound is dropped whole, keeping the depth before:
 * an evaluation reads the best line's score, and a move's label reads the
 * others' (`judgedFromList`), so each score must be exact.
 */
export function rankLine<L>(ranked: RankedLines<L>, info: SearchLine, kept: L): RankedLines<L> {
  const starts = info.rank === 1;
  const lines = starts ? rankedLines(ranked) : ranked.lines;
  const printing = starts ? [] : ranked.printing;
  if (!printing || info.bound) return { lines };
  const next = [...printing];
  next[info.rank - 1] = kept;
  return { lines, printing: next };
}

/**
 * The lines a search has settled on: the set being printed once it is
 * whole, as it is when the next set starts or the search ends, else the
 * last whole set before it.
 */
export function rankedLines<L>({ lines, printing }: RankedLines<L>): readonly L[] {
  return (printing ?? lines).filter(Boolean);
}

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

/**
 * Wraps `onLine` to pass on only the lines the app needs from the engine: the handshake
 * (`uciok`), and for each search its last set of ranked lines (`rankLine`;
 * one unless MultiPV is set higher), best first, just before its `bestmove`. The
 * engine runs in a web view on Android, and every line that crosses into
 * the app costs a trip across the bridge, so this runs where the engine
 * does: one search prints about 17 lines, and 2 cross (4 with three ranks).
 */
export function forwardNeededLines(onLine: (line: string) => void): (line: string) => void {
  let ranked: RankedLines<string> = NO_LINES;
  return (line) => {
    const info = parseInfo(line);
    if (info) ranked = rankLine(ranked, info, line);
    else if (line === 'uciok') onLine(line);
    else if (line.startsWith('bestmove')) {
      rankedLines(ranked).forEach(onLine);
      ranked = NO_LINES;
      onLine(line);
    }
  };
}
