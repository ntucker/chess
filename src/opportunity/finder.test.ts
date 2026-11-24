import { describe, expect, it } from '@jest/globals';
import type { Chess } from 'chessops/chess';

import type { Analysis, Evaluation, FinalAnalysis } from '@/evaluation/evaluation';
import { parsePosition, playLine, sanToUci } from '@/game/replay';
import type { Uci } from '@/lesson/lesson';
import { SKETCH_DEPTH } from '@/review/order';

import { acceptedReplies, byScore, type Find, findOpportunities } from './finder';
import { gainIfKnown } from './gain';
import { LIMITS } from './limits';
import { type Answers, type MoveCounts, repliesFrom, type Request, type Spot } from './walk';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** The position `sans` (moves in SAN, space-separated) reaches from the start, and its line. */
function at(sans: string): { line: Uci[]; key: string; pos: Chess } {
  const pos = parsePosition(START)!;
  const line = sans
    .split(' ')
    .filter(Boolean)
    .map((san) => {
      const move = sanToUci(pos, san)!;
      Array.from(playLine([move], pos));
      return move;
    });
  return { line, key: [...playLine([], pos)][0].key, pos };
}
const uci = (sans: string) => at(sans).line;
/** The last move of `sans`, in UCI. */
const last = (sans: string) => uci(sans).at(-1)!;

/** White's expected score, or a mate: `#2` when White mates in 2, `#-2` when Black does. */
function evaluation(score: number | string): Evaluation {
  if (typeof score === 'number') return { score, pawns: 0 };
  const mate = Number(score.slice(1));
  return { score: mate > 0 ? 1 : 0, pawns: 0, mate };
}

/** Lines of (SAN, White's expected score or a mate), best first. */
type Lines = [san: string | undefined, score: number | string][];

const replies = new Map<string, MoveCounts>();
/** Each position's searches, shallowest first. */
const analyses = new Map<string, Analysis[]>();
const guideMoves = new Map<string, Uci[]>();

/** The games each move (SAN) was played in after `sans`. */
function games(sans: string, counts: Record<string, number>) {
  const { pos, key } = at(sans);
  replies.set(
    key,
    Object.fromEntries(Object.entries(counts).map(([san, n]) => [sanToUci(pos, san)!, n])),
  );
}

/** A search of the position after `sans`: a sketch, or with `final`, a full search. */
function search(sans: string, lines: Lines, final = false): Analysis {
  const { pos } = at(sans);
  return {
    lines: lines.map(([san, score]) => ({
      ...(san && { uci: sanToUci(pos, san)! }),
      evaluation: evaluation(score),
    })),
    depth: final ? 18 : SKETCH_DEPTH,
    final,
  };
}
const full = (sans: string, lines: Lines) => search(sans, lines, true) as FinalAnalysis;
const searched = (sans: string, ...found: Analysis[]) => analyses.set(at(sans).key, found);

const OPENING = 'e4 e5 Nf3 Nf6 Nxe5 Nc6 Nxc6 dxc6';
const SETUP = `${OPENING} d3 Bc5`;
const CUE = `${SETUP} Bg5`;

// The Stafford Gambit's 6.Bg5 trap, as hand-made answers at one band: after
// 5.d3 Bc5, 15% of White players play 6.Bg5, which gives away 0.45 of White's
// expected score, and 6...Nxe4 7.Bxd8 Bxf2+ 8.Ke2 Bg4# follows. Positions not
// listed have no games and an analysis that names no move.
games(OPENING, { d3: 400, Nc3: 300, e5: 200, Bc4: 60, f3: 40 });
searched(OPENING, search(OPENING, [['d3', 0.6]]));
for (const san of ['d3', 'Nc3', 'e5', 'Bc4']) {
  searched(`${OPENING} ${san}`, search(`${OPENING} ${san}`, [[undefined, 0.58]]));
}
guideMoves.set(at(`${OPENING} d3`).key, [last(SETUP)]); // the lesson's book move
games(SETUP, { Be2: 410, f3: 190, Bg5: 150, h3: 100, Nc3: 80, c3: 70 });
searched(
  SETUP,
  search(SETUP, [['Be2', 0.55]]),
  full(SETUP, [
    ['Be2', 0.55],
    ['h3', 0.53],
    ['f3', 0.5],
  ]),
);
for (const san of ['Be2', 'f3', 'h3', 'Nc3', 'c3']) {
  searched(`${SETUP} ${san}`, search(`${SETUP} ${san}`, [[undefined, 0.5]]));
}
const CUE_LINES: Lines = [
  ['Nxe4', 0.1],
  ['Bxf2+', 0.11],
  ['h6', 0.45],
];
games(CUE, { h6: 400, Nxe4: 250, Be7: 200, Qd6: 100, 'Bxf2+': 50 });
searched(CUE, search(CUE, [['Nxe4', 0.12]]), full(CUE, CUE_LINES));
games(`${CUE} Nxe4`, { Bxd8: 730, Be3: 150, dxe4: 120 });
searched(`${CUE} Nxe4`, search(`${CUE} Nxe4`, [['Be3', 0.2]]));
searched(
  `${CUE} Nxe4 Bxd8`,
  full(`${CUE} Nxe4 Bxd8`, [
    ['Bxf2+', '#-2'],
    ['Kxd8', 0.9],
  ]),
);
games(`${CUE} Nxe4 Bxd8 Bxf2+`, { Ke2: 500 });
searched(`${CUE} Nxe4 Bxd8 Bxf2+`, search(`${CUE} Nxe4 Bxd8 Bxf2+`, [['Ke2', '#-1']]));
searched(`${CUE} Nxe4 Bxd8 Bxf2+ Ke2`, full(`${CUE} Nxe4 Bxd8 Bxf2+ Ke2`, [['Bg4#', '#-1']]));

const NO_MOVE: FinalAnalysis = { lines: [{ evaluation: evaluation(0.5) }], depth: 18, final: true };

/** The replies the lichess host gives from the games above, thin under `minGames`. */
const fromGames =
  (minGames = LIMITS.minGames) =>
  ({ key }: Spot) =>
    repliesFrom(replies.get(key) ?? {}, minGames);

/** Every answer known at once. */
const known: Answers = {
  replies: fromGames(),
  analysis: ({ key }) => analyses.get(key)?.at(-1) ?? NO_MOVE,
  guideMoves: ({ key }) => guideMoves.get(key),
};

/** A host that has only the answers asked for so far (a sketch where asked for one, if any). */
function asking() {
  const asked = new Set<string>();
  const has = (kind: Request['kind'], { key }: Spot) => asked.has(`${kind} ${key}`);
  const answers: Answers = {
    replies: (spot) => (has('replies', spot) ? known.replies(spot) : undefined),
    analysis: (spot) => {
      if (has('full', spot)) return known.analysis(spot);
      if (has('sketch', spot)) return analyses.get(spot.key)?.[0] ?? NO_MOVE;
      return undefined;
    },
    guideMoves: known.guideMoves,
  };
  const answer = (requests: readonly Request[]) => {
    for (const { kind, spot } of requests) asked.add(`${kind} ${spot.key}`);
  };
  return { answers, answer };
}

const find = (answers: Answers, limits = {}) =>
  findOpportunities({ start: START, line: uci(OPENING), side: 'black', answers, limits });

const BG5: Find = {
  line: uci(SETUP),
  mistake: last(CUE),
  replies: [last(`${CUE} Nxe4`), last(`${CUE} Bxf2+`)],
  payoff: uci(`${CUE} Nxe4 Bxd8 Bxf2+ Ke2 Bg4#`).slice(-4),
  end: 1,
  holds: true,
  reach: 0.4,
  share: 0.15,
  cost: 0.45,
  found: 0.3,
  // h6 (40%) keeps 0.35 less than Nxe4, Be7 and Qd6 (30%) 0.4 less (unsearched here: 0.5),
  // Bxf2+ (5%) 0.01 less.
  gain: 0.4 * 0.35 + 0.3 * 0.4 + 0.05 * 0.01,
  score: 0.4 * 0.15 * (0.4 * 0.35 + 0.3 * 0.4 + 0.05 * 0.01),
};

describe('findOpportunities', () => {
  it('finds the Stafford 6.Bg5 trap: the setup, the cue and the payoff', () => {
    const { finds, requests } = find(known);
    expect(requests).toEqual([]);
    expect(finds).toHaveLength(1);
    const [bg5] = finds;
    expect(bg5).toEqual({
      ...BG5,
      reach: expect.closeTo(0.4),
      cost: expect.closeTo(0.45),
      gain: expect.closeTo(BG5.gain),
      score: expect.closeTo(BG5.score),
    });
  });

  it('asks for what it lacks, most useful first, and finds the same once answered', () => {
    const host = asking();
    const first = find(host.answers);
    expect(first.finds).toEqual([]);
    expect(first.requests).toEqual([
      { kind: 'replies', spot: { line: uci(OPENING), key: at(OPENING).key } },
    ]);
    let rounds = 0;
    for (let result = first; result.requests.length; result = find(host.answers)) {
      host.answer(result.requests);
      rounds++;
    }
    expect(rounds).toBeLessThan(20);
    expect(find(host.answers).finds).toEqual(find(known).finds);
  });

  it('screens with sketches, and asks for full searches only around a mistake', () => {
    const host = asking();
    const kinds: string[] = [];
    for (let result = find(host.answers); result.requests.length; result = find(host.answers)) {
      kinds.push(...result.requests.map(({ kind, spot }) => `${kind} ${spot.line.length}`));
      host.answer(result.requests);
    }
    // Full searches: the position before 6.Bg5, the cue, the payoff's two positions for Black,
    // and the replies Black plays at the cue that its analysis doesn't list (Be7, Qd6).
    expect(kinds.filter((kind) => kind.startsWith('full'))).toEqual([
      'full 10',
      'full 11',
      'full 13',
      'full 12',
      'full 12',
      'full 15',
    ]);
  });

  it('counts a search short of the sketch depth as missing', () => {
    const shallow: Answers = {
      ...known,
      analysis: (spot) => {
        const analysis = known.analysis(spot)!;
        return analysis.final ? { ...analysis, depth: SKETCH_DEPTH - 1, final: false } : analysis;
      },
    };
    expect(find(shallow).requests[0]).toMatchObject({ kind: 'sketch' });
  });

  it('keeps to its floors', () => {
    expect(find(known, { shareFloor: 0.2 }).finds).toEqual([]);
    expect(find(known, { costFloor: 0.5 }).finds).toEqual([]);
    expect(find(known, { reachFloor: 0.5 }).finds).toEqual([]);
    expect(find(known, { maxPlies: 2 }).finds).toEqual([]);
  });

  it('ends the walk at a thin position, and says where', () => {
    const { finds, thin } = find({ ...known, replies: fromGames(1001) });
    expect(finds).toEqual([]);
    expect(thin).toEqual([{ line: uci(OPENING), key: at(OPENING).key, reach: 1 }]);
    expect(find(known).thin).toEqual([]);
  });

  it('stops Act III after the most moves the punishing side may play', () => {
    const [bg5] = find(known, { payoffMoves: 1 }).finds;
    expect(bg5.payoff).toEqual(BG5.payoff.slice(0, 2));
  });

  describe('Act III at the erring side', () => {
    const AFTER = `${CUE} Nxe4`;
    const BE3 = `${AFTER} Be3`;
    /** `known`, with `analysis` for `sans` and the guide's move Be3 after 6...Nxe4. */
    const withGuide = (sans: string, analysis: Analysis): Answers => ({
      ...known,
      guideMoves: (spot) => (spot.key === at(AFTER).key ? [last(BE3)] : known.guideMoves!(spot)),
      analysis: (spot) => (spot.key === at(sans).key ? analysis : known.analysis(spot)),
    });

    it("follows the guide's move over the most played one", () => {
      const answers = withGuide(
        BE3,
        full(BE3, [
          ['Bxe3', 0.1],
          ['h6', 0.4],
        ]),
      );
      const [bg5] = find(answers, { payoffMoves: 1 }).finds;
      expect(bg5.payoff).toEqual(uci(`${BE3} Bxe3`).slice(-2));
    });

    it("ends where the guide's move takes back the gain, and drops a find left level", () => {
      const { finds, dropped } = find(withGuide(BE3, full(BE3, [['Bxe3', 0.5]])));
      expect(finds).toEqual([]);
      expect(dropped).toMatchObject([{ payoff: [last(BE3)], end: 0.5, holds: true }]);
    });

    it("plays Stockfish's reply at a thin position and goes on", () => {
      const [bg5] = find({
        ...withGuide(AFTER, full(AFTER, [['Be3', 0.2]])),
        guideMoves: known.guideMoves,
        replies: (spot) =>
          spot.key === at(AFTER).key ? repliesFrom({}, LIMITS.minGames) : known.replies(spot),
      }).dropped;
      expect(bg5.payoff).toEqual([last(BE3)]);
    });
  });

  describe('Act III at the punishing side', () => {
    const BXD8 = `${CUE} Nxe4 Bxd8`;
    /** `known`, with the guide's move Kxd8 after 7.Bxd8, which Black's lines score as given. */
    const withGuide = (lines: Lines): Answers => ({
      ...known,
      guideMoves: (spot) =>
        spot.key === at(BXD8).key ? [last(`${BXD8} Kxd8`)] : known.guideMoves!(spot),
      analysis: (spot) => (spot.key === at(BXD8).key ? full(BXD8, lines) : known.analysis(spot)),
    });
    const payoffOf = (answers: Answers) => find(answers, { payoffMoves: 1 }).finds[0].payoff;

    it("follows the guide's move where it gives back less than the cost floor", () => {
      const answers = withGuide([
        ['Bxf2+', 0.3],
        ['Kxd8', 0.35],
      ]);
      expect(payoffOf(answers)).toEqual(uci(`${BXD8} Kxd8`).slice(-2));
    });

    it("plays Stockfish's best where the guide's move gives back more", () => {
      const answers = withGuide([
        ['Bxf2+', 0.3],
        ['Kxd8', 0.45],
      ]);
      expect(payoffOf(answers)).toEqual(uci(`${BXD8} Bxf2+`).slice(-2));
    });
  });

  it('leaves the found rate out where too few games reach the cue', () => {
    const [bg5] = find({
      ...known,
      replies: (spot) =>
        spot.key === at(CUE).key ? repliesFrom({ a: 5 }, LIMITS.minGames) : known.replies(spot),
    }).finds;
    expect(bg5.found).toBeUndefined();
  });
});

describe('acceptedReplies', () => {
  const before = full(SETUP, [['Be2', 0.55]]);
  const after = full(CUE, CUE_LINES);

  it('accepts the best reply and any that label good and keep the gain', () => {
    expect(acceptedReplies(before, after, 'black')).toEqual(BG5.replies);
  });

  it('always accepts the best reply', () => {
    expect(acceptedReplies(full(SETUP, [['Be2', 0.15]]), after, 'black')).toEqual(
      BG5.replies.slice(0, 1),
    );
  });
});

describe('byScore', () => {
  it('ranks by score, then the more reached, then by line', () => {
    const at = (score: number, reach: number, mistake = BG5.mistake): Find => ({
      ...BG5,
      score,
      reach,
      mistake,
    });
    const sorted = [at(1, 0.2, 'b'), at(1, 0.2, 'a'), at(2, 0.1), at(1, 0.3)].sort(byScore);
    expect(sorted.map(({ score, reach, mistake }) => [score, reach, mistake])).toEqual([
      [2, 0.1, BG5.mistake],
      [1, 0.3, BG5.mistake],
      [1, 0.2, 'a'],
      [1, 0.2, 'b'],
    ]);
  });
});

describe('gainIfKnown', () => {
  it('weighs each measured reply by its share, renormalised over those measured', () => {
    expect(gainIfKnown({ a: 0.5, b: 0.3, c: 0.2 }, { a: 0, b: 0.2 })).toEqual({
      gain: expect.closeTo((0.3 * 0.2) / 0.8),
      covered: 0.8,
    });
  });

  it('is 0 where no reply is measured', () => {
    expect(gainIfKnown({ a: 1 }, {})).toEqual({ gain: 0, covered: 0 });
  });
});
