import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, type PressableProps, useTheme } from '@reactive/silk-native';
import type { ComponentProps } from 'react';

import { narrowLength, narrowStyles } from '@/theme/narrow';
import { useNarrowStyles } from '@/theme/Narrow';

interface Props extends Pick<
  PressableProps,
  'accessibilityRole' | 'accessibilityLabel' | 'href' | 'hrefAttrs' | 'onPress'
> {
  readonly icon: ComponentProps<typeof Ionicons>['name'];
  readonly iconSize: number;
}

/**
 * A round icon button in the header (the source link, settings, a back
 * button), or the close of a sheet or drawer. It stays quiet in the
 * secondary ink and lights up on hover, like the transport's buttons.
 */
export function HeaderButton({ icon, iconSize, ...pressable }: Props) {
  const { theme } = useTheme();
  const { color } = theme.semantic;
  const styles = useNarrowStyles(STYLES);
  return (
    <Pressable
      {...pressable}
      style={({ pressed, hovered }) => [
        styles.button,
        (pressed || hovered) && { backgroundColor: color.tones.neutral.subtle },
      ]}
    >
      {({ pressed, hovered }) => (
        <Ionicons
          name={icon}
          size={iconSize}
          color={pressed || hovered ? color.textPrimary : color.textSecondary}
        />
      )}
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
