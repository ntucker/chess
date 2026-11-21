import { useQuery } from '@data-client/react';
import { a11yValue, Text, useReducedMotion, useTheme } from '@reactive/silk-native';
import { useIsFocused } from 'expo-router';
import { useMemo } from 'react';
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { type Color, colorName, type GameResult, lastPosition, opposite } from '@/game/replay';
import { evaluationReading, type Reading, resultEvaluation } from '@/evaluation/evaluation';
import { analysisKey, PositionAnalysis, useAnalysis } from '@/resources/analysis';
import { useSettings } from '@/settings/SettingsProvider';
import { useNarrowPart } from '@/theme/Narrow';
import { pieceColors } from '@/theme/pieceColors';
import { useSchemeColors } from '@/theme/shownTheme';
import { fonts } from '@/theme/theme';
import { timingFunction } from '@/theme/timingFunction';

interface Props {
  /** The moves (UCI) that reach the position on the board. */
  readonly line: readonly string[];
  /** The side at the bottom of the board. */
  readonly orientation: Color;
  /** Sets the bar's width; it stretches to its row's height. */
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * A column beside the board that fills with White from White's end and Black
 * from Black's, in proportion to how each side is expected to score, with the
 * leading side's advantage in pawns (or moves to mate) at its end, as the
 * engine chosen in the settings judges it. It follows the analysis as it
 * deepens (`useAnalysis`). Until the board's position has its first depth,
 * the position before stands in when the store has it (the move's label
 * asks for it): how it scored the move played, when it lists that move,
 * else how it scored itself.
 */
export function EvaluationBar({ line, orientation, style }: Props) {
  const engine = useSettings().evaluationEngine;
  // Asks only while its screen is in front, never while the web export pre-renders.
  const focused = useIsFocused();
  const position = line.join(' ');
  const moves = useMemo(() => (position ? position.split(' ') : []), [position]);
  // A finished game reads as its result (1-0, ½) rather than an advantage.
  const result = useMemo(() => lastPosition(moves).result, [moves]);
  const analysis = useAnalysis(engine, focused && !result ? moves : null);
  const before = useQuery(
    PositionAnalysis,
    ...(moves.length && !analysis ? [analysisKey(engine, moves.slice(0, -1))] : [null]),
  );
  const standIn = before?.lines.find(({ uci }) => uci === moves.at(-1)) ?? before?.lines[0];
  const evaluation = analysis?.lines[0].evaluation ?? standIn?.evaluation;
  const reading = result ? resultReading(result) : evaluation && evaluationReading(evaluation);
  return <Bar orientation={orientation} style={style} {...reading} />;
}

function resultReading(result: GameResult): Reading {
  const { winner } = result;
  const { score } = resultEvaluation(result);
  if (!winner) return { score, label: '½', leader: 'white', description: 'Drawn' };
  return {
    score,
    label: winner === 'white' ? '1-0' : '0-1',
    leader: winner,
    description: `${colorName(winner)} won`,
  };
}

function Bar({
  orientation,
  style,
  ...reading
}: Partial<Reading> & Pick<Props, 'orientation' | 'style'>) {
  const { theme } = useTheme();
  const { color, motion } = theme.semantic;
  const schemeColors = useSchemeColors();
  const reducedMotion = useReducedMotion();
  const part = useNarrowPart();
  const score = reading.score ?? 0.5;
  // White fills from whichever end is White's.
  const whiteEnd = orientation === 'white' ? 'bottom' : 'top';
  const labelEnd = reading.leader === opposite(orientation) ? 'top' : 'bottom';
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Evaluation: ${reading.description ?? 'not ready'}`}
      {...a11yValue({ min: 0, max: 100, now: Math.round(score * 100) })}
      style={[
        styles.track,
        style,
        {
          backgroundColor: pieceColors.black,
          borderColor: schemeColors['evaluation-edge'],
          borderRadius: theme.semantic.radius.sm,
        },
      ]}
    >
      <Animated.View
        style={[
          styles.white,
          { [whiteEnd]: 0, height: `${score * 100}%`, backgroundColor: pieceColors.white },
          // A Reanimated CSS transition, which StyleSheet's types don't know.
          {
            transitionProperty: 'height',
            transitionDuration: reducedMotion ? 0 : motion.slow.durationMs,
            transitionTimingFunction: timingFunction(motion.slow.easing),
          },
        ]}
      />
      <View style={[styles.midline, { backgroundColor: color.tones.accent.solid }]} />
      {reading.label ? (
        // A narrow page's strip is too thin for the number; its fill still shows who leads.
        <Text
          role="caption"
          numberOfLines={1}
          {...part('wide-only', [
            styles.label,
            {
              [labelEnd]: 5,
              color: reading.leader === 'white' ? pieceColors.black : pieceColors.white,
            },
          ])}
        >
          {reading.label}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { borderWidth: 1, overflow: 'hidden' },
  white: { position: 'absolute', left: 0, right: 0 },
  midline: { position: 'absolute', left: 0, right: 0, top: '50%', height: 1, opacity: 0.7 },
  label: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontFamily: fonts.mono,
    fontSize: 10,
    lineHeight: 12,
    letterSpacing: -0.3,
  },
});
