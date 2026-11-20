import type { Color } from '@/game/replay';

/** What the endings page (/dev/endings) shows: a game that ends one way for the learner. */
export interface EndingExample {
  readonly title: string;
  readonly sentence: string;
  /** The learner's side, at the bottom. */
  readonly learner: Color;
  /** UCI moves to the end of the game. */
  readonly line: readonly string[];
}

/** A short game for each way a game ends for the learner. */
export const endingExamples: readonly EndingExample[] = [
  {
    title: 'Win',
    sentence: "Scholar's mate: the learner, White, mates with the queen on f7.",
    learner: 'white',
    line: ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7'],
  },
  {
    title: 'Loss',
    sentence: "Fool's mate: the learner, White, is mated by the queen on h4.",
    learner: 'white',
    line: ['f2f3', 'e7e5', 'g2g4', 'd8h4'],
  },
  {
    title: 'Draw',
    sentence: "Sam Loyd's ten-move stalemate: Black, the learner, has no move.",
    learner: 'black',
    line: [
      ...['e2e3', 'a7a5', 'd1h5', 'a8a6', 'h5a5', 'h7h5', 'h2h4', 'a6h6', 'a5c7', 'f7f6'],
      ...['c7d7', 'e8f7', 'd7b7', 'd8d3', 'b7b8', 'd3h7', 'b8c8', 'f7g6', 'c8e6'],
    ],
  },
];
