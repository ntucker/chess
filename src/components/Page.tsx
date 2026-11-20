import { useTheme } from '@reactive/silk-native';
import Head from 'expo-router/head';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Header, type HeaderProps } from '@/components/Header';
import { PAGE_SPACE } from '@/components/sideBySide';
import { narrowStyles } from '@/theme/narrow';
import { useNarrowPart, useNarrowStyles } from '@/theme/Narrow';
import { spotlight } from '@/theme/theme';

interface Props {
  /** The browser tab's title; none leaves it as it is. */
  readonly title?: string;
  /** What the header shows of where the page is (see `Header`). */
  readonly header?: HeaderProps;
  /** The width the header and the page's content stop growing at. */
  readonly maxWidth: number;
  readonly children: ReactNode;
}

/**
 * A screen of the app: the stage background with its spotlight, the header,
 * and the content below it, scrolling as one. On a narrow page it fills the
 * window, so a panel can scroll on its own in what the board leaves, and the
 * page scrolls only once that panel is at its floor.
 */
export function Page({ title, header, maxWidth, children }: Props) {
  const { theme } = useTheme();
  const styles = useNarrowStyles(STYLES);
  const part = useNarrowPart();
  return (
    <View
      style={[
        styles.fill,
        {
          backgroundColor: theme.semantic.color.surface,
          backgroundImage: spotlight[theme.colorScheme],
        },
      ]}
    >
      {title === undefined ? null : (
        <Head>
          <title>{title}</title>
        </Head>
      )}
      <SafeAreaView style={styles.fill}>
        <ScrollView contentContainerStyle={styles.fillGrow}>
          <View {...part('page', styles.page)}>
            <View style={[styles.header, { maxWidth }]}>
              <Header {...header} />
            </View>
            {children}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const STYLES = narrowStyles((px) => ({
  fill: { flex: 1 },
  // Lets a narrow page grow to the window's height (narrow.css does it with min-height on the web).
  fillGrow: { flexGrow: 1 },
  page: { padding: px(PAGE_SPACE), gap: px(PAGE_SPACE), alignItems: 'center' },
  header: { width: '100%' },
}));
