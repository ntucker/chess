import Ionicons from '@expo/vector-icons/Ionicons';
import { Text, Tooltip, useTheme } from '@reactive/silk-native';
import type { ComponentProps, ReactNode } from 'react';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';

import { Notation } from '@/components/Notation';
import { spokenOnly } from '@/theme/narrow';

interface Props {
  /** What `children` mean, in a line: "Blunder: gave away 20% or more of your winning chances." */
  readonly tip: string;
  readonly children: ReactNode;
  /** The trigger's box, around `children`. */
  readonly style?: StyleProp<ViewStyle>;
  /**
   * Keyboard focus can land on the tip itself, for `children` that take
   * none, such as a disabled button: focus opens it as on a control.
   */
  readonly focusable?: boolean;
  /** Whether it shows, for a caller that opens it another way too; left out, it keeps its own state. */
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
}

/**
 * `children` with `tip` beside them while asked for: a mouse resting on
 * them, keyboard focus landing inside them, or a tap. Screen readers read
 * the tip after `children`, so the words reach everyone without taking room
 * on the screen.
 *
 * ```tsx
 * <Tip tip="Blunder: gave away 20% or more of your winning chances.">
 *   <QualityBadge quality="blunder" size={20} />
 * </Tip>
 * ```
 */
export function Tip({ tip, children, style, focusable, open, onOpenChange }: Props) {
  return (
    <Tooltip.Root open={open} onOpenChange={onOpenChange}>
      <Tooltip.Trigger style={style} focusable={focusable}>
        {children}
        <Text style={spokenOnly}>{tip}</Text>
      </Tooltip.Trigger>
      {/* As Silk sets a string, with any move it names in the learner's notation. */}
      <Tooltip.Content>
        <Text role="label">
          <Notation>{tip}</Notation>
        </Text>
      </Tooltip.Content>
    </Tooltip.Root>
  );
}

/**
 * The mark that something has a tip to show, `size` to suit the text beside
 * it: an info mark, or `name`, an icon that names what the tip explains.
 */
export function InfoMark({
  size,
  name = 'information-circle-outline',
  style,
}: {
  readonly size: number;
  readonly name?: ComponentProps<typeof Ionicons>['name'];
  readonly style?: StyleProp<TextStyle>;
}) {
  const { theme } = useTheme();
  return (
    <Ionicons name={name} size={size} color={theme.semantic.color.textSecondary} style={style} />
  );
}

/**
 * A heading, `children`, with `tip` and an info mark beside it that hints
 * the tip is there: "Opportunities ⓘ".
 */
export function HeadingTip({
  tip,
  children,
  style,
}: {
  readonly tip: string;
  readonly children: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
}) {
  return (
    <Tip tip={tip} style={[HEADING_ROW, style]}>
      {children}
      <InfoMark size={HEADING_INFO_SIZE} />
    </Tip>
  );
}

/** The mark beside the heading's last word, as wide as it needs. */
const HEADING_ROW: ViewStyle = {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 4,
  flexShrink: 1,
};
/** The info mark, about as tall as an eyebrow's capitals. */
export const HEADING_INFO_SIZE = 13;
