import { useController } from '@data-client/react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button, Inline, Separator, Stack } from '@reactive/silk-native';
import { useIsFocused } from 'expo-router';
import { useReducer, useState } from 'react';

import { lastMoveBadge } from '@/board/drawing';
import { EvaluationEngineChoice } from '@/components/EvaluationEngineChoice';
import { Eyebrow, useLabelled } from '@/components/Eyebrow';
import { FootnoteLink } from '@/components/FootnoteLink';
import { GameStatus } from '@/components/GameStatus';
import { OpponentChoice } from '@/components/OpponentChoice';
import { OpponentPicker } from '@/components/OpponentPicker';
import { Scoresheet } from '@/components/Scoresheet';
import { BoardColumn, Stage } from '@/components/Stage';
import { gameReducer, initialGame } from '@/game/game';
import { type Color, colorName, opposite } from '@/game/replay';
import { useGame } from '@/game/useGame';
import { describeOpponent } from '@/opponent/opponent';
import { gameOpponent, useWarmOpponent } from '@/resources/opponent';
import { useSettings } from '@/settings/SettingsProvider';

export default function PlayScreen() {
  const ctrl = useController();
  const { opponent, evaluationEngine } = useSettings();
  const described = describeOpponent(opponent);
  const labelled = useLabelled();
  // The side of the game on the board, which the next game keeps.
  const [playerColor, setPlayerColor] = useState<Color>('white');
  const active = useIsFocused();
  useWarmOpponent(opponent, active);
  const game = useGame(useReducer(gameReducer, initialGame), gameOpponent(ctrl, opponent), {
    side: playerColor,
    active,
    judge: evaluationEngine,
  });
  const { moves, ply, current, thinking, goto } = game;
  const restart = game.newGame;

  const newGame = (side: Color) => {
    setPlayerColor(side);
    restart();
  };

  return (
    <Stage
      title="Free play · Opening Night"
      header={{ onRestart: () => newGame(playerColor) }}
      board={
        <BoardColumn
          game={game}
          rival={{
            name: described.name,
            detail: `${colorName(opposite(playerColor))} · ${described.lead.toLowerCase()}`,
            detailControl: <OpponentPicker />,
          }}
          board={{
            fen: current.fen,
            orientation: playerColor,
            turnColor: current.turn,
            movableColor: game.canMove ? playerColor : undefined,
            dests: current.dests,
            lastMove: current.move ? [current.move.from, current.move.to] : undefined,
            drawings: lastMoveBadge(current.move?.to, game.quality),
            check: current.check,
            onMove: game.move,
          }}
          // Until the player's first move there is nothing to lose, so the
          // discs swap sides; afterwards, a new game keeps the side.
          onSwap={game.started ? undefined : () => newGame(opposite(playerColor))}
        />
      }
      program={
        <Stack gap="5">
          <GameStatus
            playerColor={playerColor}
            latest={game.latest}
            viewing={game.atLatest ? undefined : ply}
            total={moves.length}
            opponent={opponent}
            thinking={thinking}
            error={game.error}
            onRetry={game.retry}
          />
          <Separator />
          <Inline>
            <Button onPress={() => newGame(playerColor)}>
              <Ionicons name="refresh" size={15} /> New game
            </Button>
          </Inline>
          <Separator />
          <Stack style={labelled}>
            <Eyebrow>Scoresheet</Eyebrow>
            <Scoresheet plies={game.plies} qualities={game.qualities} ply={ply} onGoto={goto} />
          </Stack>
          <Stack gap="1">
            <OpponentChoice />
            <EvaluationEngineChoice />
            <FootnoteLink href="/" back>
              Back to the lesson
            </FootnoteLink>
          </Stack>
        </Stack>
      }
    />
  );
}
