import { a11yState, Inline, Pressable, Text, useTheme } from '@reactive/silk-native';
import { useId } from 'react';
import { StyleSheet } from 'react-native';

import { visuallyHidden } from '@/theme/narrow';
import { touchPadding, touchTarget } from '@/theme/touch';

const WEB = process.env.EXPO_OS === 'web';

/** One option of a FootnoteChoice. */
export interface FootnoteOption<T extends string | number> {
  readonly value: T;
  readonly label: string;
  /** What choosing it means, read out by screen readers. */
  readonly hint: string;
}

interface Props<T extends string | number> {
  /** What is being chosen, for screen readers. */
  readonly name: string;
  /** The words before the options, like "Evaluation by". */
  readonly lead: string;
  readonly options: readonly FootnoteOption<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
}

/**
 * A setting written as a footnote: "Evaluation by Stockfish · Maia", with the
 * chosen option in the primary ink. For settings changed rarely, so it stays
 * small and quiet. On a touch screen each option is at least a finger's
 * size (`touchTarget`), which spaces the options and the lines apart.
 */
export function FootnoteChoice<T extends string | number>({
  name,
  lead,
  options,
  value,
  onChange,
}: Props<T>) {
  const { color } = useTheme().theme.semantic;
  const id = useId();
  return (
    <Inline
      gap="0"
      align="center"
      wrap="wrap"
      accessibilityRole="radiogroup"
      accessibilityLabel={name}
    >
      <Text role="caption" tone="secondary">
        {lead}
      </Text>
      {options.map((option, index) => {
        const selected = option.value === value;
        const hintId = `${id}-${option.value}`;
        return (
          // Each dot follows its option in one group, so a wrapped line
          // starts with an option, never a dot.
          <Inline key={option.value} gap="0" align="center" wrap="nowrap">
            <Pressable
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityHint={option.hint}
              // React Native Web ignores accessibilityHint, so the web reads
              // the hint from the hidden text below.
              {...(WEB ? { 'aria-describedby': hintId } : {})}
              {...a11yState({ checked: selected })}
              onPress={() => onChange(option.value)}
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
                  {option.label}
                </Text>
              )}
            </Pressable>
            {WEB ? (
              // aria-hidden keeps it out of the reading order; the radio's
              // aria-describedby still reads it as the description.
              <Text nativeID={hintId} aria-hidden style={styles.hint}>
                {option.hint}
              </Text>
            ) : null}
            {index < options.length - 1 ? (
              <Text role="caption" tone="secondary" aria-hidden>
                ·
              </Text>
            ) : null}
          </Inline>
        );
      })}
    </Inline>
  );
}

/**
 * A four-digit rating's width in caption text (theme.ts's `typography.caption`,
 * 12 px), about: measure again if that changes. Larger system text only widens it.
 */
const RATING_WIDTH = 25;

const styles = StyleSheet.create({
  option: {
    minHeight: touchTarget,
    justifyContent: 'center',
    borderRadius: 4,
    // The same padding on every option, so the gaps around the dots stay even:
    // as much as makes the shortest option, a four-digit rating, a finger wide.
    paddingHorizontal: touchPadding(RATING_WIDTH, 4),
    paddingVertical: 2,
  },
  // Out of sight and out of layout, but still readable as a description.
  hint: { ...visuallyHidden, opacity: 0 },
});
