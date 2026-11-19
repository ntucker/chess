import { Text } from '@reactive/silk-native';
import { type Href, Link } from 'expo-router';
import { StyleSheet } from 'react-native';

interface Props {
  /** Another screen of the app, without a trailing slash (GitHub Pages 404s on one). */
  readonly href: Href;
  /** Return to `href` when it's under this screen, keeping its state, rather than open it anew. */
  readonly dismissTo?: boolean;
  readonly children: string;
}

/** A quiet link to another screen, set like the footnotes beside it. */
export function FootnoteLink({ href, dismissTo, children }: Props) {
  return (
    <Link href={href} dismissTo={dismissTo}>
      <Text role="caption" tone="secondary" style={styles.link}>
        {children}
      </Text>
    </Link>
  );
}

const styles = StyleSheet.create({
  link: { textDecorationLine: 'underline' },
});
