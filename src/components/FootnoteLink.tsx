import { Text } from '@reactive/silk-native';
import { type Href, Link, useRouter } from 'expo-router';
import type { MouseEvent } from 'react';
import { type GestureResponderEvent, StyleSheet } from 'react-native';

interface Props {
  /** Another screen of the app, without a trailing slash (GitHub Pages 404s on one). */
  readonly href: Href;
  /** Go back to the screen underneath, keeping its state, when there is one; else open `href`. */
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
        if (!back || !plainPress(event) || !router.canGoBack()) return;
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

/** A tap, or a left click with no modifier key: other clicks open `href` as the browser does. */
export const plainPress = (event: MouseEvent<HTMLAnchorElement> | GestureResponderEvent) =>
  !('button' in event) ||
  (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey);

const styles = StyleSheet.create({
  link: { textDecorationLine: 'underline' },
});
