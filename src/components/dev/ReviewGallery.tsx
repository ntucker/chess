import { Stack, Surface, Text } from '@reactive/silk-native';
import { Link } from 'expo-router';
import { useReducer } from 'react';
import { StyleSheet, View } from 'react-native';

import type { FinalAnalysis } from '@/evaluation/evaluation';
import { Eyebrow } from '@/components/Eyebrow';
import { ReviewPanel, type ReviewView } from '@/components/review/ReviewPanel';
import { legalMoveCountAt, replay } from '@/game/replay';
import type { Uci } from '@/lesson/lesson';
import { reviewMoves } from '@/review/review';
import { reviewedGame, reviewReducer, startReview } from '@/review/screen';
import { evaluationFromScore } from '@/stockfish/uci';

import { DevPage, devStyles } from './DevPage';

/**
 * Each state of the review's panel, side by side, on one game: a Caro-Kann
 * Advance where Black leaves the guide with 7...Qxb2, a blunder. The app
 * doesn't link here.
 */
export function ReviewGallery() {
  return (
    <DevPage
      title="Game review"
      intro="The review's panel in each state it can be in, for one Caro-Kann game where Black blunders with 7...Qxb2. Step through each with its scoresheet; point at a move card's rows."
    >
      <Link
        href={`/review?${new URLSearchParams({ moves: LINE.join(' '), side: 'black', lesson: 'caro-kann' })}`}
      >
        <Text role="body" tone="accent">
          {"Open this game's review, searched for real"}
        </Text>
      </Link>
      <View style={devStyles.grid}>
        {STATES.map((state) => (
          <StateCard key={state.title} {...state} />
        ))}
      </View>
    </DevPage>
  );
}

/** The game: the guide's moves to 5...c5, then 6.Be3 Qb6 7.Nc3 Qxb2. */
const LINE: Uci[] = [
  'e2e4',
  'c7c6',
  'd2d4',
  'd7d5',
  'e4e5',
  'c8f5',
  'g1f3',
  'e7e6',
  'f1e2',
  'c6c5',
  'c1e3',
  'd8b6',
  'b1c3',
  'b6b2',
];
const PLIES = replay(LINE);
/** The first ten moves are the guide's. */
const BOOK = LINE.map((_, n) => n < 10);
const LEGAL = PLIES.map(({ fen }) => legalMoveCountAt(fen));

/** A final analysis of lines (move, White's advantage in pawns), best first. */
const analysis = (...lines: [Uci, number][]): FinalAnalysis => ({
  lines: lines.map(([uci, pawns]) => ({
    uci,
    evaluation: evaluationFromScore({ kind: 'cp', value: pawns * 100 }, 0),
  })),
  depth: 18,
  final: true,
});

/** Stockfish's analyses of the positions after the guide's moves, by ply. */
const SEARCHED: Readonly<Record<number, FinalAnalysis>> = {
  10: analysis(['c2c3', 0.4], ['c1e3', 0.3], ['e1g1', 0.2]),
  11: analysis(['d8b6', 0.3], ['b8c6', 0.4], ['c5d4', 0.5]),
  12: analysis(['b1c3', 0.4], ['b2b3', 0.3], ['d1c1', 0.2]),
  13: analysis(['b8c6', 0.3], ['c5c4', 0.5], ['g8e7', 0.6]),
  14: analysis(['c3b5', 3.6], ['e3d2', 1.2], ['e1g1', 0.9]),
};

interface State {
  readonly title: string;
  readonly sentence: string;
  /** The plies whose analyses have come in. */
  readonly searched: readonly number[];
  /** Plies whose search gave up. */
  readonly failed?: readonly number[];
  /** Where the card starts. */
  readonly ply: number;
}

const STATES: readonly State[] = [
  {
    title: 'Coming in',
    sentence: 'The start, while Stockfish still checks the last moves.',
    searched: [10, 11],
    ply: 0,
  },
  {
    title: 'A move still waiting',
    sentence: '7...Qxb2 before the search after it lands: no label, and a dashed ring.',
    searched: [10, 11, 12, 13],
    ply: 14,
  },
  {
    title: 'A blunder',
    sentence: "7...Qxb2 judged, beside Stockfish's top moves from the position before it.",
    searched: [10, 11, 12, 13, 14],
    ply: 14,
  },
  {
    title: 'A search that gave up',
    sentence: 'Stockfish stopped on the position after 7...Qxb2: Try again searches it again.',
    searched: [10, 11, 12, 13],
    failed: [14],
    ply: 14,
  },
  {
    title: 'Checked',
    sentence: 'The start once every move is checked.',
    searched: [10, 11, 12, 13, 14],
    ply: 0,
  },
];

function StateCard({ title, sentence, searched, failed = [], ply }: State) {
  const game = reviewedGame('black', LINE);
  const [screen, dispatch] = useReducer(reviewReducer, { ...startReview(game), ply });
  const analyses = PLIES.map((_, n) => (searched.includes(n) ? SEARCHED[n] : undefined));
  const lost = new Set(failed);
  const moves = reviewMoves({ plies: PLIES, book: BOOK, legal: LEGAL, analyses, failed: lost });
  const review: ReviewView = {
    plies: PLIES,
    ply: screen.ply,
    moves,
    analyses,
    pointed: screen.pointed,
    nextMoment: undefined,
    goto: (target) => dispatch({ type: 'goto', ply: target }),
    point: (uci) => dispatch({ type: 'point', uci }),
    tryAgain: () => {},
    failure: () => (failed.length ? new Error('Stockfish stopped') : undefined),
  };
  return (
    <Stack gap="3" style={[devStyles.card, styles.card]}>
      <Stack gap="1">
        <Eyebrow>{title}</Eyebrow>
        <Text role="bodySm">{sentence}</Text>
      </Stack>
      <Surface elevation="raised" radius="md" border="subtle" style={styles.panel}>
        <ReviewPanel eyebrow="Review · Caro-Kann" learner="black" review={review} />
      </Surface>
    </Stack>
  );
}

const styles = StyleSheet.create({
  // As wide as the panel beside a board.
  card: { flexBasis: 340, maxWidth: 400 },
  panel: { padding: 20 },
});
