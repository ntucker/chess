import { useController } from '@data-client/react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button, Inline, Separator, Stack } from '@reactive/silk-native';
import { useIsFocused } from 'expo-router';
import { useReducer, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { lastMoveBadge } from '@/board/drawing';
import { EvaluationEngineChoice } from '@/components/EvaluationEngineChoice';
import { Eyebrow } from '@/components/Eyebrow';
import { FootnoteLink } from '@/components/FootnoteLink';
import { GameStatus } from '@/components/GameStatus';
import { OpponentChoice } from '@/components/OpponentChoice';
import { Scoresheet } from '@/components/Scoresheet';
import { SideChooser } from '@/components/SideChooser';
import { BoardColumn, Stage } from '@/components/Stage';
import { gameReducer, initialGame } from '@/game/game';
import { type Color, colorName, opposite } from '@/game/replay';
import { useGame } from '@/game/useGame';
import { describeOpponent } from '@/opponent/opponent';
import { gameOpponent } from '@/resources/opponent';
import { useSettings } from '@/settings/SettingsProvider';

export default function PlayScreen() {
  const ctrl = useController();
  const { opponent, evaluationEngine } = useSettings();
  const described = describeOpponent(opponent);
  // The side of the game on the board, and the side the next game will take.
  const [playerColor, setPlayerColor] = useState<Color>('white');
  const [nextColor, setNextColor] = useState<Color>(playerColor);
  const game = useGame(useReducer(gameReducer, initialGame), gameOpponent(ctrl, opponent), {
    side: playerColor,
    active: useIsFocused(),
    judge: evaluationEngine,
  });
  const { moves, ply, current, thinking, goto } = game;

  const newGame = (side: Color) => {
    setPlayerColor(side);
    game.newGame();
  };
  const chooseSide = (side: Color) => {
    setNextColor(side);
    // Nothing to lose yet, so switch sides right away.
    if (!game.started && side !== playerColor) newGame(side);
  };

  return (
    <Stage
      title="Free play · Opening Night"
      board={
        <BoardColumn
          game={game}
          rival={{
            name: described.name,
            detail: `${described.tagline} · ${colorName(opposite(playerColor))}`,
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
          <Stack gap="3">
            <Eyebrow>Play as</Eyebrow>
            <Inline gap="3" align="center" wrap="nowrap">
              <View style={styles.fill}>
                <SideChooser value={nextColor} onChange={chooseSide} />
              </View>
              <Button onPress={() => newGame(nextColor)}>
                <Ionicons name="refresh" size={15} /> New game
              </Button>
            </Inline>
          </Stack>
          <Separator />
          <Stack gap="3">
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

const styles = StyleSheet.create({ fill: { flex: 1 } });
