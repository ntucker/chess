import Ionicons from '@expo/vector-icons/Ionicons';
import { a11yState, Pressable, type PressableProps, useTheme } from '@reactive/silk-native';
import type { ComponentProps, ComponentRef, ReactNode, Ref } from 'react';
import type { View } from 'react-native';

import { narrowLength, narrowStyles } from '@/theme/narrow';
import { useNarrowStyles } from '@/theme/Narrow';

type Props = Base &
  (
    | {
        readonly icon: ComponentProps<typeof Ionicons>['name'];
        readonly iconSize: number;
        readonly face?: never;
      }
    /** Its face in place of an icon, drawn in `ink`: the notation switch's piece. */
    | {
        readonly face: (ink: string) => ReactNode;
        readonly icon?: never;
        readonly iconSize?: never;
      }
  );

interface Base extends Pick<
  PressableProps,
  | 'accessibilityRole'
  | 'accessibilityLabel'
  | 'accessibilityHint'
  | 'href'
  | 'hrefAttrs'
  | 'onPress'
  | 'onLongPress'
  | 'delayLongPress'
> {
  /** Whether it is on, for a switch. */
  readonly checked?: boolean;
  readonly ref?: Ref<ComponentRef<typeof View>>;
}

/**
 * A round icon button in the header (the source link, settings, a back
 * button, the theme button), or the close of a sheet, or the
 * scoresheet's notation switch. It stays quiet in the
 * secondary ink and lights up on hover, like the transport's buttons.
 */
export function HeaderButton({ icon, iconSize, face, checked, ...pressable }: Props) {
  const { theme } = useTheme();
  const { color } = theme.semantic;
  const styles = useNarrowStyles(STYLES);
  return (
    <Pressable
      {...pressable}
      {...(checked !== undefined && a11yState({ checked }))}
      style={({ pressed, hovered }) => [
        styles.button,
        (pressed || hovered) && { backgroundColor: color.tones.neutral.subtle },
      ]}
    >
      {({ pressed, hovered }) => {
        const ink = pressed || hovered ? color.textPrimary : color.textSecondary;
        return face ? face(ink) : <Ionicons name={icon} size={iconSize} color={ink} />;
      }}
    </Pressable>
  );
}

/** The button's size, smaller on a narrow page, where the header is slim. */
export const HEADER_BUTTON_SIZE = narrowLength('header-button-size', 36);

const STYLES = narrowStyles((px) => ({
  button: {
    width: px(HEADER_BUTTON_SIZE),
    height: px(HEADER_BUTTON_SIZE),
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
