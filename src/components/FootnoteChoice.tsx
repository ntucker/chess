import { a11yState, Inline, Pressable, Text, useTheme } from '@reactive/silk-native';
import { useId } from 'react';
import { StyleSheet } from 'react-native';

import { spokenOnly } from '@/theme/narrow';
import { negated, touchPadding, touchTarget } from '@/theme/touch';

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
 *
 * The options stay beside the lead while they all fit there; otherwise they
 * start a line of their own, so a phone reads the lead, then a row of
 * options, not one option stranded on a tall second line. A wrapped line's
 * first option lines its text up with the lead's.
 */
export function FootnoteChoice<T extends string | number>({
  name,
  lead,
  options,
  value,
  onChange,
}: Props<T>) {
  const id = useId();
  return (
    <Inline
      gap="0"
      align="center"
      wrap="wrap"
      accessibilityRole="radiogroup"
      accessibilityLabel={name}
    >
      <Text role="caption" tone="secondary" style={styles.lead}>
        {lead}
      </Text>
      <Inline gap="0" align="center" wrap="wrap" style={styles.options}>
        {options.map((option, index) => (
          <Option
            key={option.value}
            option={option}
            selected={option.value === value}
            hintId={`${id}-${option.value}`}
            dotted={index < options.length - 1}
            onPress={() => onChange(option.value)}
          />
        ))}
      </Inline>
    </Inline>
  );
}

/** One option, with the dot after it unless it is the last (`dotted`). */
function Option<T extends string | number>({
  option,
  selected,
  hintId,
  dotted,
  onPress,
}: {
  readonly option: FootnoteOption<T>;
  readonly selected: boolean;
  /** The id of its hint's hidden text on the web. */
  readonly hintId: string;
  readonly dotted: boolean;
  readonly onPress: () => void;
}) {
  const { color } = useTheme().theme.semantic;
  return (
    // The dot follows its option in one group, so a wrapped line starts with
    // an option, never a dot.
    <Inline gap="0" align="center" wrap="nowrap">
      <Pressable
        accessibilityRole="radio"
        accessibilityLabel={option.label}
        accessibilityHint={option.hint}
        // React Native Web ignores accessibilityHint, so the web reads
        // the hint from the hidden text below.
        {...(WEB ? { 'aria-describedby': hintId } : {})}
        {...a11yState({ checked: selected })}
        onPress={onPress}
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
      {dotted ? (
        <Text role="caption" tone="secondary" aria-hidden>
          ·
        </Text>
      ) : null}
    </Inline>
  );
}

/**
 * A four-digit rating's width in caption text (theme.ts's `typography.caption`,
 * 12 px), about: measure again if that changes. Larger system text only widens it.
 */
const RATING_WIDTH = 25;

/**
 * The same padding on every option, so the gaps around the dots stay even:
 * as much as makes the shortest option, a four-digit rating, a finger wide.
 */
const OPTION_PADDING = touchPadding(RATING_WIDTH, 4);

const styles = StyleSheet.create({
  // Its gap to the first option's text, as wide as an option's padding.
  lead: { marginRight: OPTION_PADDING },
  // Pulls each line's first option left by its padding, so its text starts where the lead's does.
  // It shrinks to the line where it can't fit on one, so its options wrap rather than overflow.
  options: { marginLeft: negated(OPTION_PADDING), flexShrink: 1 },
  option: {
    minHeight: touchTarget,
    justifyContent: 'center',
    borderRadius: 4,
    paddingHorizontal: OPTION_PADDING,
    paddingVertical: 2,
  },
  // Out of sight and out of layout, but still readable as a description.
  hint: spokenOnly,
});
