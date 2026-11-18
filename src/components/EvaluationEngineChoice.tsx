import { a11yState, Pressable, Text, useTheme } from '@reactive/silk-native';
import { useId } from 'react';
import { StyleSheet, View } from 'react-native';

import { EVALUATION_ENGINES, type EvaluationEngine } from '@/evaluation/evaluation';
import { setEvaluationEngine, useEvaluationEngine } from '@/evaluation/useEvaluationEngine';
import { JUDGE_RATING } from '@/maia/maia';

const WEB = process.env.EXPO_OS === 'web';

const ENGINE_CHOICES: Record<EvaluationEngine, { label: string; hint: string }> = {
  stockfish: {
    label: 'Stockfish',
    hint: 'How the position stands, judged by the Stockfish chess engine.',
  },
  maia: {
    label: 'Maia',
    hint: `How players rated about ${JUDGE_RATING} tend to score from here. Uses less memory.`,
  },
};

/**
 * A footnote that picks the engine judging the evaluation bar: "Evaluation by
 * Stockfish · Maia", with the chosen engine in the primary ink. Swapping is
 * rare, so it stays small and quiet.
 */
export function EvaluationEngineChoice() {
  const engine = useEvaluationEngine();
  const { color } = useTheme().theme.semantic;
  const id = useId();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Evaluation bar" style={styles.row}>
      <Text role="caption" tone="secondary">
        Evaluation by
      </Text>
      {EVALUATION_ENGINES.map((value, index) => {
        const selected = value === engine;
        const { label, hint } = ENGINE_CHOICES[value];
        const hintId = `${id}-${value}`;
        return (
          // Each dot stays with the engine after it, so a wrapped line never
          // starts with one.
          <View key={value} style={styles.item}>
            {index > 0 ? (
              <Text role="caption" tone="secondary" aria-hidden>
                ·
              </Text>
            ) : null}
            <Pressable
              accessibilityRole="radio"
              accessibilityLabel={label}
              accessibilityHint={hint}
              // React Native Web ignores accessibilityHint, so the web reads
              // the hint from the hidden text below.
              {...(WEB ? { 'aria-describedby': hintId } : {})}
              {...a11yState({ checked: selected })}
              hitSlop={8}
              onPress={() => setEvaluationEngine(value)}
              style={styles.option}
            >
              {({ hovered }) => (
                <Text
                  role="caption"
                  style={{
                    color: selected || hovered ? color.textPrimary : color.textSecondary,
                    fontWeight: selected ? '600' : '400',
                    textDecorationLine: hovered && !selected ? 'underline' : 'none',
                  }}
                >
                  {label}
                </Text>
              )}
            </Pressable>
            {WEB ? (
              <Text nativeID={hintId} style={styles.visuallyHidden}>
                {hint}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 2 },
  item: { flexDirection: 'row', alignItems: 'center', columnGap: 2 },
  option: { borderRadius: 4, paddingHorizontal: 2, paddingVertical: 2 },
  // Out of sight and out of layout, but still readable as a description.
  visuallyHidden: {
    position: 'absolute',
    width: 1,
    height: 1,
    overflow: 'hidden',
    opacity: 0,
  },
});
