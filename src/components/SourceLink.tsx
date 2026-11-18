import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, type PressableProps, useTheme } from '@reactive/silk-native';
import { Linking, StyleSheet } from 'react-native';

/** Where Opening Night's source code lives. */
const SOURCE_URL = 'https://github.com/ntucker/chess';

// On the web it is a real anchor that opens a new tab; elsewhere pressing it
// opens the browser. (expo-router's `<Link asChild>` would drop the Pressable's
// style function, and with it the size and hover state.)
const opensSource: Pick<PressableProps, 'href' | 'hrefAttrs' | 'onPress'> =
  process.env.EXPO_OS === 'web'
    ? { href: SOURCE_URL, hrefAttrs: { target: '_blank', rel: 'noopener noreferrer' } }
    : { onPress: () => Linking.openURL(SOURCE_URL) };

/**
 * The GitHub mark, linking to the app's source. It stays quiet in the
 * secondary ink and lights up on hover, like the transport's buttons.
 */
export function SourceLink() {
  const { theme } = useTheme();
  const { color } = theme.semantic;
  return (
    <Pressable
      {...opensSource}
      accessibilityRole="link"
      accessibilityLabel="Source code on GitHub"
      style={({ pressed, hovered }) => [
        styles.button,
        (pressed || hovered) && { backgroundColor: color.tones.neutral.subtle },
      ]}
    >
      {({ pressed, hovered }) => (
        <Ionicons
          name="logo-github"
          size={20}
          color={pressed || hovered ? color.textPrimary : color.textSecondary}
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
