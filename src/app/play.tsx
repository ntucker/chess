import { useController } from '@data-client/react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button, Inline, Separator, Stack } from '@reactive/silk-native';
import { useIsFocused } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { lastMoveBadge } from '@/board/drawing';
import { EvaluationEngineChoice } from '@/components/EvaluationEngineChoice';
import { Eyebrow } from '@/components/Eyebrow';
import { FootnoteLink } from '@/components/FootnoteLink';
import { GameStatus } from '@/components/GameStatus';
import { OpponentChoice } from '@/components/OpponentChoice';
import { PlayerBar } from '@/components/PlayerBar';
import { Scoresheet } from '@/components/Scoresheet';
import { SideChooser } from '@/components/SideChooser';
import { BoardColumn, Stage } from '@/components/Stage';
import { Transport } from '@/components/Transport';
import { useStepKeys } from '@/components/useStepKeys';
import { type Color, colorName, opposite } from '@/game/replay';
import { useGame } from '@/game/useGame';
import { describeOpponent } from '@/opponent/opponent';
import { gameOpponent } from '@/resources/opponent';
import { useSettings } from '@/settings/SettingsProvider';

export default function PlayScreen() {
  const ctrl = useController();
  const { opponent } = useSettings();
  const described = describeOpponent(opponent);
  // The side of the game on the board, and the side the next game will take.
  const [playerColor, setPlayerColor] = useState<Color>('white');
  const [nextColor, setNextColor] = useState<Color>(playerColor);
  const game = useGame(gameOpponent(ctrl, opponent), {
    side: playerColor,
    active: useIsFocused(),
  });
  const { moves, ply, current, toMove, thinking, goto } = game;
  const opponentColor = opposite(playerColor);

  const newGame = (side: Color) => {
    setPlayerColor(side);
    game.newGame();
  };
  const chooseSide = (side: Color) => {
    setNextColor(side);
    // Nothing to lose yet, so switch sides right away.
    if (!game.started && side !== playerColor) newGame(side);
  };

  useStepKeys(ply, moves.length, goto);

  return (
    <Stage
      title="Free play · Opening Night"
      board={
        <BoardColumn
          top={
            <PlayerBar
              name={described.name}
              detail={`${described.tagline} · ${colorName(opponentColor)}`}
              color={opponentColor}
              toMove={toMove === opponentColor}
              thinking={thinking}
              material={game.material[opponentColor]}
            />
          }
          bottom={
            <PlayerBar
              name="You"
              detail={colorName(playerColor)}
              color={playerColor}
              toMove={toMove === playerColor}
              material={game.material[playerColor]}
            >
              <Transport ply={ply} total={moves.length} onGoto={goto} />
            </PlayerBar>
          }
          evaluated={moves.slice(0, ply)}
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
            <Scoresheet moves={moves} plies={game.plies} ply={ply} onGoto={goto} />
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
