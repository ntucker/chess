import { Pager, Stack, useTheme } from '@reactive/silk-native';
import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet } from 'react-native';

import { useSections } from '@/components/Eyebrow';
import { ScoresheetPage } from '@/components/ScoresheetPage';
import { useNarrowPart } from '@/theme/Narrow';

/** A phone's pages under the board: the screen's own (`home`, and any page before it), and the scoresheet. */
export type PhonePage<H extends string> = H | 'scoresheet';

/**
 * A phone's panel under the board: `head` over pages side by side, any
 * `before` the screen's own (`home`), then the scoresheet, which the move
 * pill or a sideways swipe slides between (`usePages` owns which shows),
 * with a dot for each at their foot. All stay mounted, so a page keeps
 * where it's scrolled to. `bleed` widens the pages into the page's margin by
 * that much, and insets each page back, for rows whose highlight reaches
 * the edge.
 */
export function PhonePages<H extends string>({
  head,
  before,
  home,
  page,
  onPage,
  children,
  scoresheet,
  scoresheetReachable = true,
  bleed = 0,
}: {
  readonly head: ReactNode;
  /** A page one swipe before the home page: which, and what it holds. */
  readonly before?: { readonly page: H; readonly children: ReactNode };
  readonly home: H;
  readonly page: PhonePage<H>;
  readonly onPage: (page: PhonePage<H>) => void;
  /** The home page's content. */
  readonly children: ReactNode;
  readonly scoresheet: ComponentProps<typeof ScoresheetPage>;
  /** Whether a swipe can reach the scoresheet's page, as the pill can. */
  readonly scoresheetReachable?: boolean;
  readonly bleed?: number;
}) {
  const part = useNarrowPart();
  const sections = useSections();
  const pageStyle = [styles.page, { paddingHorizontal: bleed }];
  const { theme } = useTheme();
  const clearDots = { paddingBottom: DOTS_STEPS * theme.semantic.space[2] };
  return (
    <Stack {...part('pages-panel', sections)}>
      {head}
      {/* The pager proposes only its pages' values. */}
      <Pager.Root
        value={page}
        onValueChange={(value) => onPage(value as PhonePage<H>)}
        style={[styles.pages, { marginHorizontal: -bleed }]}
      >
        {before ? (
          <Pager.Page value={before.page} style={pageStyle}>
            {before.children}
          </Pager.Page>
        ) : null}
        <Pager.Page value={home} style={pageStyle}>
          {children}
        </Pager.Page>
        {/* Its table doesn't fade at its foot, so it ends above the dots. */}
        <Pager.Page
          value="scoresheet"
          disabled={!scoresheetReachable}
          style={[pageStyle, clearDots]}
        >
          <ScoresheetPage {...scoresheet} />
        </Pager.Page>
        {/* Over the panes' faded foot (`FadingScroll`), so a page a swipe away shows it's there. */}
        <Pager.Indicator testID="page-dots" style={styles.dots} />
      </Pager.Root>
    </Stack>
  );
}

/**
 * The steps of space the dots take at the pages' foot: they sit on it
 * (`styles.dots`) a step tall, and a second step clears them.
 */
const DOTS_STEPS = 2;

/** The pages' least height: a few lines. Below it the panel scrolls instead. */
const PAGES_FLOOR = 140;

const styles = StyleSheet.create({
  // They grow from their floor into what the panel leaves under the head:
  // a zero height would grow to their content natively, in the panel's scroll view.
  pages: { flexGrow: 1, flexShrink: 1, minHeight: PAGES_FLOOR, height: PAGES_FLOOR },
  // A page takes the pages' height and no more, so what it holds scrolls within.
  page: { flexGrow: 1, flexShrink: 1, minHeight: 0 },
  // On the panel's foot, which the page's margin already holds off the screen's edge.
  dots: { bottom: 0 },
});
