import { useTheme } from '@reactive/silk-native';
import Head from 'expo-router/head';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Header, type HeaderProps } from '@/components/Header';
import { PAGE_SPACE } from '@/components/sideBySide';
import { narrowPart } from '@/theme/narrow';
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
 * and the content below it, scrolling as one.
 */
export function Page({ title, header, maxWidth, children }: Props) {
  const { theme } = useTheme();
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
        <ScrollView>
          <View {...narrowPart('page')} style={styles.page}>
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

const styles = StyleSheet.create({
  fill: { flex: 1 },
  page: { padding: PAGE_SPACE.value, gap: PAGE_SPACE.value, alignItems: 'center' },
  header: { width: '100%' },
});
