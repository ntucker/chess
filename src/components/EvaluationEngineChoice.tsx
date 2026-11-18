import { a11yState, Pressable, Text, useTheme } from '@reactive/silk-native';
import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';

import { EVALUATION_ENGINES, type EvaluationEngine } from '@/evaluation/evaluation';
import { setEvaluationEngine, useEvaluationEngine } from '@/evaluation/useEvaluationEngine';
import { JUDGE_RATING } from '@/maia/maia';

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
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Evaluation bar" style={styles.row}>
      <Text role="caption" tone="secondary">
        Evaluation by
      </Text>
      {EVALUATION_ENGINES.map((value, index) => {
        const selected = value === engine;
        const { label, hint } = ENGINE_CHOICES[value];
        return (
          <Fragment key={value}>
            {index > 0 ? (
              <Text role="caption" tone="secondary" aria-hidden>
                ·
              </Text>
            ) : null}
            <Pressable
              accessibilityRole="radio"
              accessibilityLabel={label}
              accessibilityHint={hint}
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
          </Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 2 },
  option: { borderRadius: 4, paddingHorizontal: 2, paddingVertical: 2 },
});
