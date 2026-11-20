import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, type PressableProps, useTheme } from '@reactive/silk-native';
import type { ComponentProps } from 'react';
import { StyleSheet } from 'react-native';

import { narrowLength } from '@/theme/narrow';

interface Props extends Pick<
  PressableProps,
  'accessibilityRole' | 'accessibilityLabel' | 'href' | 'hrefAttrs' | 'onPress'
> {
  readonly icon: ComponentProps<typeof Ionicons>['name'];
  readonly iconSize: number;
}

/**
 * A round icon button in the header (the source link, a back button). It
 * stays quiet in the secondary ink and lights up on hover, like the
 * transport's buttons.
 */
export function HeaderButton({ icon, iconSize, ...pressable }: Props) {
  const { theme } = useTheme();
  const { color } = theme.semantic;
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

/** The button's size, smaller on a narrow web page, where the header is slim. */
const SIZE = narrowLength('source-link-size', 36);

const styles = StyleSheet.create({
  button: {
    width: SIZE.value,
    height: SIZE.value,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
