import { AsyncBoundary, useSuspense } from '@data-client/react';
import { a11yValue, Text, useReducedMotion, useTheme } from '@reactive/silk-native';
import { useDeferredValue, useMemo } from 'react';
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, { type CSSTransitionTimingFunction, cubicBezier } from 'react-native-reanimated';

import { type Color, colorName, type GameResult, lastPosition, opposite } from '@/game/replay';
import { useEvaluationEngine } from '@/evaluation/useEvaluationEngine';
import type { Evaluation, EvaluationEngine } from '@/evaluation/evaluation';
import { getEvaluation } from '@/resources/evaluation';
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
 * leading side's advantage in pawns (or moves to mate) at its end, as the
 * engine chosen in the settings judges it. It keeps showing the last
 * evaluation until the new one is ready.
 */
export function EvaluationBar({ line, orientation, style }: Props) {
  const engine = useEvaluationEngine();
  const position = line.join(' ');
  // A failed evaluation leaves the bar empty only until the board shows
  // another position or the setting picks another engine. AsyncBoundary
  // attaches its `listen` again whenever the function changes, so a new
  // listener for each that resets at once clears the last one's error.
  const resetOnChange = useMemo(() => resetListener(engine, position), [engine, position]);
  const empty = <Bar orientation={orientation} style={style} />;
  return (
    <AsyncBoundary fallback={empty} errorComponent={() => empty} listen={resetOnChange}>
      <EvaluatedBar engine={engine} position={position} orientation={orientation} style={style} />
    </AsyncBoundary>
  );
}

/**
 * A boundary listener that resets the boundary as soon as it's attached. It
 * ignores its arguments: taking them only makes each engine and position's
 * listener a distinct function.
 */
const resetListener = (_engine: EvaluationEngine, _position: string) => (reset: () => void) => {
  reset();
  return () => {};
};

function EvaluatedBar({
  engine,
  position,
  orientation,
  style,
}: Omit<Props, 'line'> & { readonly engine: EvaluationEngine; readonly position: string }) {
  // Both start empty, so neither the server nor the first render runs an
  // engine, and then trail the board together (React updates every deferred
  // value of a render at once) until the evaluation is ready.
  const judge = useDeferredValue<EvaluationEngine | null>(engine, null);
  const moves = useDeferredValue<string | null>(position, null);
  const shown = moves === null ? null : moves ? moves.split(' ') : [];
  const result = shown && lastPosition(shown).result;
  // A finished game needs no evaluation, and neither does the first render.
  const args = judge && shown && !result ? ([judge, shown] as const) : null;
  // A null argument skips the fetch.
  const evaluation = useSuspense(getEvaluation, ...(args ?? [null]));
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

function evaluationReading({ score, pawns, mate }: Evaluation): Reading {
  if (mate !== undefined) {
    const leader = score < 0.5 ? 'black' : 'white';
    const moves = Math.abs(mate);
    return {
      score,
      label: `M${moves}`,
      leader,
      description: `${colorName(leader)} mates in ${moves} ${moves === 1 ? 'move' : 'moves'}`,
    };
  }
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
            transitionTimingFunction: timingFunction(motion.slow.easing),
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

/**
 * A theme easing, which is a CSS string, as a Reanimated timing function.
 * Reanimated takes the named curves as strings but a `cubic-bezier(...)` only
 * as its own object.
 */
function timingFunction(easing: string): CSSTransitionTimingFunction {
  const bezier = /^cubic-bezier\((.*)\)$/.exec(easing);
  if (!bezier) return easing as CSSTransitionTimingFunction;
  const [x1, y1, x2, y2] = bezier[1].split(',').map(Number);
  return cubicBezier(x1, y1, x2, y2);
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
