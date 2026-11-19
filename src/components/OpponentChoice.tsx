import { describeOpponent, type Opponent, OPPONENT_ENGINES } from '@/opponent/opponent';
import { setOpponentEngine } from '@/opponent/useOpponent';

import { FootnoteChoice } from './FootnoteChoice';

/** A footnote that picks the engine playing the opponent: "Play against Maia · Stockfish". */
export function OpponentChoice({ opponent }: { readonly opponent: Opponent }) {
  const options = OPPONENT_ENGINES.map((engine) => {
    const { name, style } = describeOpponent({ ...opponent, engine });
    return { value: engine, label: name, hint: style };
  });
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
