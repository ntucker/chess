import { describeOpponent, OPPONENT_PRESETS } from '@/opponent/opponent';
import { useSettings, useSettingsDispatch } from '@/settings/SettingsProvider';

import { FootnoteChoice } from './FootnoteChoice';

const OPTIONS = OPPONENT_PRESETS.map((opponent) => {
  const { level, style } = describeOpponent(opponent);
  return { value: opponent, label: level, hint: style };
});

/**
 * A footnote that picks how hard the opponent plays, easiest first:
 * "Play against 1100 · 1500 · 1900 · Stockfish · Full Stockfish".
 */
export function OpponentChoice() {
  const { opponent } = useSettings();
  const dispatch = useSettingsDispatch();
  return (
    <FootnoteChoice
      name="Opponent"
      lead="Play against"
      options={OPTIONS}
      value={opponent}
      onChange={(choice) => dispatch({ type: 'chosen', choice: { opponent: choice } })}
    />
  );
}
