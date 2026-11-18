import type { Evaluation } from '@/evaluation/evaluation';

// The parts of the UCI protocol (https://backscattered.github.io/uci/) the
// evaluation bar uses: what to send for a position, and how to read the
// engine's score out of the lines it prints while it searches.

/** A score as Stockfish reports it, from the side to move's point of view. */
export interface Score {
  readonly kind: 'cp' | 'mate';
  readonly value: number;
}

/**
 * The score of a finished depth that an `info` line reports, or undefined
 * for any other line. Lines whose score is only a bound (`lowerbound`,
 * `upperbound`) come before the depth is finished, so they are skipped too.
 */
export function parseScore(line: string): Score | undefined {
  if (!line.startsWith('info ') || / (lower|upper)bound\b/.test(line)) return undefined;
  const match = / depth \d+\b.* score (cp|mate) (-?\d+)\b/.exec(line);
  if (!match) return undefined;
  const [, kind, value] = match;
  return { kind: kind as Score['kind'], value: Number(value) };
}

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
 * Passes on only the lines the app needs from the engine: the handshake
 * (`uciok`), and for each search its last finished score just before its
 * `bestmove`. The engine runs in a web view on Android, and every line that
 * crosses into the app costs a trip across the bridge, so this runs where
 * the engine does: one search prints about 17 lines, and 2 cross.
 */
export function neededLines(onLine: (line: string) => void): (line: string) => void {
  let lastScore: string | undefined;
  return (line) => {
    if (parseScore(line)) lastScore = line;
    else if (line === 'uciok') onLine(line);
    else if (line.startsWith('bestmove')) {
      if (lastScore) onLine(lastScore);
      lastScore = undefined;
      onLine(line);
    }
  };
}
