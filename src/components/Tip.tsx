import { Text, Tooltip } from '@reactive/silk-native';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import { spokenOnly } from '@/theme/narrow';

interface Props {
  /** What `children` mean, in a line: "Blunder: gave away 20% or more of your winning chances." */
  readonly tip: string;
  readonly children: ReactNode;
  /** The trigger's box, around `children`. */
  readonly style?: StyleProp<ViewStyle>;
  /**
   * Keyboard focus can land on the tip itself, for `children` that take
   * none, such as a badge: focus opens it as on a control.
   */
  readonly focusable?: boolean;
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
export function Tip({ tip, children, style, focusable }: Props) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger style={style} focusable={focusable}>
        {children}
        <Text style={spokenOnly}>{tip}</Text>
      </Tooltip.Trigger>
      <Tooltip.Content>{tip}</Tooltip.Content>
    </Tooltip.Root>
  );
}
