import { AsyncBoundary, useSuspense } from '@data-client/react';
import { a11yValue, Text, useReducedMotion, useTheme } from '@reactive/silk-native';
import { useDeferredValue, useMemo } from 'react';
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { resetListener } from '@/components/resetListener';
import { type Color, colorName, type GameResult, lastPosition, opposite } from '@/game/replay';
import {
  type EvaluationEngine,
  evaluationReading,
  type Reading,
  resultEvaluation,
} from '@/evaluation/evaluation';
import { getEvaluation } from '@/resources/evaluation';
import { useSettings } from '@/settings/SettingsProvider';
import { useNarrowPart } from '@/theme/Narrow';
import { pieceColors } from '@/theme/pieceColors';
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
 * engine chosen in the settings judges it. It keeps showing the last
 * evaluation until the new one is ready.
 */
export function EvaluationBar({ line, orientation, style }: Props) {
  const engine = useSettings().evaluationEngine;
  const position = line.join(' ');
  // A failed evaluation leaves the bar empty only until the board shows
  // another position or the setting picks another engine.
  const resetOnChange = useMemo(() => resetListener(engine, position), [engine, position]);
  const empty = <Bar orientation={orientation} style={style} />;
  return (
    <AsyncBoundary fallback={empty} errorComponent={() => empty} listen={resetOnChange}>
      <EvaluatedBar engine={engine} position={position} orientation={orientation} style={style} />
    </AsyncBoundary>
  );
}

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
  // A finished game reads as its result (1-0, ½) rather than an advantage,
  // drawn at once rather than waiting on a fetch.
  const result = shown && lastPosition(shown).result;
  // Null, which skips the fetch, on the first render (nothing deferred yet)
  // and once the game is over.
  const fetchArgs = judge && shown && !result ? ([judge, shown] as const) : null;
  const evaluation = useSuspense(getEvaluation, ...(fetchArgs ?? [null]));
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
