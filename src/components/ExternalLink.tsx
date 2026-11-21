import { Linking, Text as Span, StyleSheet } from 'react-native';

/**
 * Props that open `url` outside the app: on the web a real anchor opening a
 * new tab, elsewhere the browser. For a Text or a Pressable (expo-router's
 * `<Link asChild>` would drop a Pressable's style function).
 */
export const opensUrl = (url: string) =>
  process.env.EXPO_OS === 'web'
    ? { href: url, hrefAttrs: { target: '_blank', rel: 'noopener noreferrer' } }
    : { onPress: () => Linking.openURL(url) };

/** A link inside text, opening `url` outside the app; `label` names it where its text is too short to. */
export function ExternalLink({
  url,
  label,
  children,
}: {
  readonly url: string;
  readonly label?: string;
  readonly children: string;
}) {
  return (
    <Span {...opensUrl(url)} role="link" aria-label={label} style={styles.link}>
      {children}
    </Span>
  );
}

const styles = StyleSheet.create({
  link: { textDecorationLine: 'underline' },
});
