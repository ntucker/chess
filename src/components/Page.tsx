import { Separator, Stack, useTheme } from '@reactive/silk-native';
import Head from 'expo-router/head';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Header, type HeaderProps } from '@/components/Header';
import { PAGE_SPACE } from '@/theme/sideBySide';
import { narrowStyles } from '@/theme/narrow';
import { useNarrowPageHeight, useNarrowPart, useNarrowStyles } from '@/theme/Narrow';
import { useSchemeColors } from '@/theme/shownTheme';

interface Props {
  /** The browser tab's title; none leaves it as it is. */
  readonly title?: string;
  /** What the header shows of where the page is (see `Header`). */
  readonly header?: HeaderProps;
  /** The width the header and the page's content stop growing at. */
  readonly maxWidth: number;
  /**
   * On a narrow phone, the page is the window's height, so a panel inside can
   * scroll on its own (the board page). Otherwise it grows with its content.
   */
  readonly fillsWindow?: boolean;
  readonly children: ReactNode;
  /**
   * Small print across the foot of a wide page, under a rule: at the window's
   * foot when the page is shorter, else after the content. A narrow page has
   * no room for it, so the screen shows it elsewhere.
   */
  readonly footer?: ReactNode;
}

/**
 * A screen of the app: the stage background with its spotlight, the header,
 * and the content below it, scrolling as one. A page that `fillsWindow` scrolls
 * only once the panel inside is at its floor.
 */
export function Page({ title, header, maxWidth, fillsWindow = false, children, footer }: Props) {
  const { theme } = useTheme();
  const schemeColors = useSchemeColors();
  const styles = useNarrowStyles(STYLES);
  const part = useNarrowPart();
  const windowHeight = useNarrowPageHeight();
  const height = fillsWindow ? windowHeight : undefined;
  return (
    <View
      style={[
        styles.fill,
        {
          backgroundColor: theme.semantic.color.surface,
          backgroundImage: schemeColors.spotlight,
        },
      ]}
    >
      {title === undefined ? null : (
        <Head>
          <title>{title}</title>
        </Head>
      )}
      <SafeAreaView style={styles.fill}>
        <ScrollView contentContainerStyle={height === undefined ? styles.fillGrow : { height }}>
          <View {...part('page', styles.page)}>
            <View style={[styles.header, { maxWidth }]}>
              <Header {...header} />
            </View>
            {children}
            {footer ? (
              <Stack gap="3" {...part('wide-only', [styles.footer, { maxWidth }])}>
                <Separator />
                {footer}
              </Stack>
            ) : null}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const STYLES = narrowStyles((px) => ({
  fill: { flex: 1 },
  // Fills the window with the page's background; a narrow page natively takes its own height.
  fillGrow: { flexGrow: 1 },
  // Grows to the window's height, so the footer's auto margin puts it at the window's foot.
  page: { flexGrow: 1, padding: px(PAGE_SPACE), gap: px(PAGE_SPACE), alignItems: 'center' },
  header: { width: '100%' },
  footer: { width: '100%', marginTop: 'auto' },
}));
