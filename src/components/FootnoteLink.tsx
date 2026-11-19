import { Text } from '@reactive/silk-native';
import { type Href, Link, useRouter } from 'expo-router';
import { StyleSheet } from 'react-native';

interface Props {
  /** Another screen of the app, without a trailing slash (GitHub Pages 404s on one). */
  readonly href: Href;
  /**
   * Go back to the screen underneath, keeping its state, when there is one
   * (whichever lesson opened this screen); open `href` only when there isn't.
   */
  readonly back?: boolean;
  readonly children: string;
}

/** A quiet link to another screen, set like the footnotes beside it. */
export function FootnoteLink({ href, back, children }: Props) {
  const router = useRouter();
  return (
    <Link
      href={href}
      onPress={(event) => {
        if (!back || !router.canGoBack()) return;
        event.preventDefault();
        router.back();
      }}
    >
      <Text role="caption" tone="secondary" style={styles.link}>
        {children}
      </Text>
    </Link>
  );
}

const styles = StyleSheet.create({
  link: { textDecorationLine: 'underline' },
});
