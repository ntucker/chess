import { AsyncBoundary, useSuspense } from '@data-client/react';
import { a11yValue, Text, useReducedMotion, useTheme } from '@reactive/silk-native';
import { useDeferredValue, useMemo } from 'react';
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { type Color, colorName, type GameResult, lastPosition, opposite } from '@/game/replay';
import { type Evaluation, getEvaluation } from '@/resources/maia';
import { fonts, pieceColors } from '@/theme/theme';

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
export function EvaluationBar({ line, orientation, style }: Props) {
  // A failed evaluation leaves the bar empty only until the board shows
  // another position: the boundary calls each new listener it gets.
  const position = line.join(' ');
  const resetOnMove = useMemo(() => resetFor(position), [position]);
  const empty = <Bar orientation={orientation} style={style} />;
  return (
    <AsyncBoundary fallback={empty} errorComponent={() => empty} listen={resetOnMove}>
      <EvaluatedBar position={position} orientation={orientation} style={style} />
    </AsyncBoundary>
  );
}

/** A boundary listener for `position` that clears any error as soon as it's attached. */
const resetFor = (_position: string) => (reset: () => void) => {
  reset();
  return () => {};
};

function EvaluatedBar({
  position,
  orientation,
  style,
}: Omit<Props, 'line'> & { readonly position: string }) {
  // Starts empty, so neither the server nor the first render runs the
  // network, and then trails the board until the evaluation is ready.
  const moves = useDeferredValue<string | null>(position, null);
  const shown = moves === null ? null : moves ? moves.split(' ') : [];
  const result = shown && lastPosition(shown).result;
  // A finished game needs no evaluation; null skips the fetch.
  const evaluation = useSuspense(getEvaluation, shown && !result ? shown : null);
  const reading = result
    ? resultReading(result)
    : evaluation && evaluationReading(evaluation);
  return <Bar orientation={orientation} style={style} {...reading} />;
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
  // Tenths of a pawn below 10, whole pawns from there up to 99.
  const tenths = Math.round(Math.abs(pawns) * 10) / 10;
  const label = tenths < 10 ? tenths.toFixed(1) : String(Math.min(99, Math.round(tenths)));
  if (tenths === 0) return { score, label, leader: 'white', description: 'Even' };
  const leader = pawns < 0 ? 'black' : 'white';
  return { score, label, leader, description: `${colorName(leader)} is ahead by ${label} pawns` };
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
  const { color, motion } = theme.semantic;
  const reducedMotion = useReducedMotion();
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
            transitionDuration: reducedMotion ? 0 : motion.slow.durationMs,
            // Reanimated takes a curve object, not the theme's CSS string.
            transitionTimingFunction: 'ease-out',
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
