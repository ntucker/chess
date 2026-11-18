import { AsyncBoundary, useSuspense } from '@data-client/react';
import { Text, useTheme } from '@reactive/silk-native';
import { useDeferredValue } from 'react';
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { type Color, colorName, type GameResult, lastPosition, opposite } from '@/game/replay';
import type { Evaluation } from '@/maia/maia';
import type { MaiaRating } from '@/maia/models';
import { getMaiaEvaluation } from '@/resources/maia';
import { fonts, pieceColors } from '@/theme/theme';

/**
 * The Maia network that judges positions. Of Maia's networks, 1900's value
 * head comes closest to Stockfish's evaluations.
 */
const JUDGE: MaiaRating = 1900;

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
 * leading side's advantage in pawns at its end. It keeps showing the last
 * position's evaluation until the new one is ready.
 */
export function EvaluationBar(props: Props) {
  const { orientation, style } = props;
  return (
    <AsyncBoundary
      fallback={<Bar orientation={orientation} style={style} />}
      errorComponent={() => <Bar orientation={orientation} style={style} />}
    >
      <EvaluatedBar {...props} />
    </AsyncBoundary>
  );
}

function EvaluatedBar({ line, orientation, style }: Props) {
  // Starts empty, so neither the server nor the first render runs the
  // network, and then trails the board until the evaluation is ready.
  const moves = useDeferredValue<string | null>(line.join(' '), null);
  const shown = moves === null ? null : moves.split(' ').filter(Boolean);
  const evaluation = useSuspense(
    getMaiaEvaluation,
    ...(shown === null ? ([null] as const) : ([JUDGE, shown] as const)),
  );
  if (!shown || !evaluation) return <Bar orientation={orientation} style={style} />;
  const { result } = lastPosition(shown);
  return (
    <Bar
      orientation={orientation}
      style={style}
      {...(result ? resultReading(result) : evaluationReading(evaluation))}
    />
  );
}

interface Reading {
  /** White's share of the bar, from 0 to 1. */
  readonly score: number;
  readonly label: string;
  /** The side whose end shows the label. */
  readonly leader: Color;
  readonly description: string;
}

function evaluationReading({ score, pawns }: Evaluation): Reading {
  const size = Math.abs(pawns);
  const label = size < 10 ? size.toFixed(1) : String(Math.min(99, Math.round(size)));
  // An even position shows 0.0 at White's end, even when Black is a hair ahead.
  const leader = pawns < 0 && label !== '0.0' ? 'black' : 'white';
  return {
    score,
    label,
    leader,
    description:
      label === '0.0' ? 'Even' : `${colorName(leader)} is ahead by ${label} pawns`,
  };
}

function resultReading({ winner }: GameResult): Reading {
  if (!winner) return { score: 0.5, label: '½', leader: 'white', description: 'Drawn' };
  return {
    score: winner === 'white' ? 1 : 0,
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
  const { color } = theme.semantic;
  const score = reading.score ?? 0.5;
  // White fills from whichever end is White's.
  const whiteEnd = orientation === 'white' ? 'bottom' : 'top';
  const labelEnd = reading.leader === opposite(orientation) ? 'top' : 'bottom';
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Evaluation: ${reading.description ?? 'not ready'}`}
      // The web ignores accessibilityValue; these work on every platform.
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(score * 100)}
      style={[
        styles.track,
        style,
        {
          backgroundColor: pieceColors.black,
          // On the light page the bar's white end needs a firmer edge.
          borderColor:
            theme.colorScheme === 'dark' ? color.borderSubtle : color.tones.neutral.border,
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
            transitionDuration: 450,
            transitionTimingFunction: 'ease-in-out',
          },
        ]}
      />
      <View style={[styles.midline, { backgroundColor: color.tones.accent.solid }]} />
      {reading.label ? (
        <Text
          role="caption"
          numberOfLines={1}
          style={[
            styles.label,
            {
              [labelEnd]: 5,
              color: reading.leader === 'white' ? pieceColors.black : pieceColors.white,
            },
          ]}
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
