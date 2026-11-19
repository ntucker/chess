import { a11yState, Inline, Pressable, Text, useTheme } from '@reactive/silk-native';
import { useId } from 'react';
import { StyleSheet } from 'react-native';

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
 * small and quiet.
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
              hitSlop={8}
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
              <Text nativeID={hintId} aria-hidden style={styles.visuallyHidden}>
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

const styles = StyleSheet.create({
  option: { borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2 },
  // Out of sight and out of layout, but still readable as a description.
  visuallyHidden: {
    position: 'absolute',
    width: 1,
    height: 1,
    overflow: 'hidden',
    opacity: 0,
  },
});
