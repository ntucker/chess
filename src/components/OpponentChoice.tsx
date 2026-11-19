import {
  type Opponent,
  OPPONENT_ENGINES,
  OPPONENT_NAMES,
  opponentStyle,
} from '@/opponent/opponent';
import { setOpponentEngine } from '@/opponent/useOpponent';

import { FootnoteChoice } from './FootnoteChoice';

/** A footnote that picks the engine playing the opponent: "Play against Maia · Stockfish". */
export function OpponentChoice({ opponent }: { readonly opponent: Opponent }) {
  const options = OPPONENT_ENGINES.map((engine) => ({
    value: engine,
    label: OPPONENT_NAMES[engine],
    hint: opponentStyle({ ...opponent, engine }),
  }));
  return (
    <FootnoteChoice
      name="Opponent"
      lead="Play against"
      options={options}
      value={opponent.engine}
      onChange={setOpponentEngine}
    />
  );
}
