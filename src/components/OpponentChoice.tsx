import { describeOpponent, type Opponent, OPPONENT_PRESETS } from '@/opponent/opponent';
import { setOpponent } from '@/opponent/useOpponent';

import { FootnoteChoice } from './FootnoteChoice';

const OPTIONS = OPPONENT_PRESETS.map((opponent) => ({
  value: opponent,
  label: opponent === 'stockfish' ? 'Stockfish' : String(opponent),
  hint: describeOpponent(opponent).style,
}));

/**
 * A footnote that picks how hard the opponent plays, easiest first:
 * "Play against 1100 · 1500 · 1900 · Stockfish".
 */
export function OpponentChoice({ opponent }: { readonly opponent: Opponent }) {
  return (
    <FootnoteChoice
      name="Opponent"
      lead="Play against"
      options={OPTIONS}
      value={opponent}
      onChange={setOpponent}
    />
  );
}
