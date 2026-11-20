import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, useTheme } from '@reactive/silk-native';
import { type Href, Link } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';

/** A link's screen, and what a screen reader says it opens. */
export interface Destination {
  /** Another screen of the app, without a trailing slash (GitHub Pages 404s on one). */
  readonly href: Href;
  /** What a screen reader says it opens, such as "Every opening". */
  readonly label: string;
}

interface Props {
  /** Where it opens; without one, only the name shows. */
  readonly to?: Destination;
  /** The name it shows, given whether the pointer is on it: in the primary ink then. */
  readonly children: (active: boolean) => ReactNode;
}

/**
 * The name of where the page is, as a link to a screen that lists the other
 * places: the name, then a chevron. It stays in its own ink until the pointer
 * is on it, so it reads as the name first.
 */
export function PlaceLink({ to, children }: Props) {
  const { theme } = useTheme();
  const { color } = theme.semantic;
  if (!to) return children(false);
  return (
    <Link href={to.href} asChild>
      <Pressable accessibilityRole="link" accessibilityLabel={to.label} style={styles.link}>
        {({ hovered, pressed }) => {
          const active = hovered || pressed;
          return (
            <>
              {children(active)}
              <Ionicons
                name="chevron-forward"
                size={14}
                color={active ? color.textPrimary : color.textSecondary}
                style={styles.chevron}
              />
            </>
          );
        }}
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  // Only as wide as the name, so the rest of its line doesn't open the list.
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    flexShrink: 1,
    minWidth: 0,
    borderRadius: 4,
  },
  chevron: { flexShrink: 0 },
});
