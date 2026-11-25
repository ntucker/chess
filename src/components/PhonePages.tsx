import { Pager, Stack } from '@reactive/silk-native';
import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet } from 'react-native';

import { useSections } from '@/components/Eyebrow';
import { ScoresheetPage } from '@/components/ScoresheetPage';
import { useNarrowPart } from '@/theme/Narrow';

/**
 * A phone's panel under the board: `head` over two pages side by side, the
 * screen's own (`home`) and the scoresheet, which the move pill or a
 * sideways swipe slides between (`usePages` owns which shows). Both stay
 * mounted, so a page keeps where it's scrolled to. `bleed` widens the pages
 * into the page's margin by that much, and insets each page back, for rows
 * whose highlight reaches the edge.
 */
export function PhonePages<H extends string>({
  head,
  home,
  page,
  onPage,
  children,
  scoresheet,
  scoresheetReachable = true,
  bleed = 0,
}: {
  readonly head: ReactNode;
  readonly home: H;
  readonly page: H | 'scoresheet';
  readonly onPage: (page: H | 'scoresheet') => void;
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
  return (
    <Stack {...part('pages-panel', sections)}>
      {head}
      {/* The pager proposes only its pages' values. */}
      <Pager.Root
        value={page}
        onValueChange={(value) => onPage(value as H | 'scoresheet')}
        style={[styles.pages, { marginHorizontal: -bleed }]}
      >
        <Pager.Page value={home} style={pageStyle}>
          {children}
        </Pager.Page>
        <Pager.Page value="scoresheet" disabled={!scoresheetReachable} style={pageStyle}>
          <ScoresheetPage {...scoresheet} />
        </Pager.Page>
      </Pager.Root>
    </Stack>
  );
}

/** The pages' least height: a few lines. Below it the panel scrolls instead. */
const PAGES_FLOOR = 140;

const styles = StyleSheet.create({
  // They grow from their floor into what the panel leaves under the head:
  // a zero height would grow to their content natively, in the panel's scroll view.
  pages: { flexGrow: 1, flexShrink: 1, minHeight: PAGES_FLOOR, height: PAGES_FLOOR },
  // A page takes the pages' height and no more, so what it holds scrolls within.
  page: { flexGrow: 1, flexShrink: 1, minHeight: 0 },
});
