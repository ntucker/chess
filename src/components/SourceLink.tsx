import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@reactive/silk-native';
import { Linking, Pressable, StyleSheet } from 'react-native';

/** Where Opening Night's source code lives. */
const SOURCE_URL = 'https://github.com/ntucker/chess';

const web = process.env.EXPO_OS === 'web';

// On the web the button is a real anchor that opens a new tab, through React
// Native Web's `href` and `hrefAttrs` (missing from React Native's types).
// expo-router's `<Link asChild>` would do the same, but it replaces the
// Pressable's style function, which drops the button's size and hover state.
const anchor = web
  ? ({ href: SOURCE_URL, hrefAttrs: { target: '_blank', rel: 'noopener noreferrer' } } as object)
  : {};

type State = { pressed: boolean; hovered?: boolean };

/**
 * The GitHub mark, linking to the app's source. It stays quiet in the
 * secondary ink and lights up on hover, like the transport's buttons.
 */
export function SourceLink() {
  const { theme } = useTheme();
  const { color } = theme.semantic;
  return (
    <Pressable
      {...anchor}
      onPress={web ? undefined : () => Linking.openURL(SOURCE_URL)}
      accessibilityRole="link"
      accessibilityLabel="Source code on GitHub"
      style={({ pressed, hovered }: State) => [
        styles.button,
        (pressed || hovered) && { backgroundColor: color.tones.neutral.subtle },
      ]}
    >
      {({ pressed, hovered }: State) => (
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
