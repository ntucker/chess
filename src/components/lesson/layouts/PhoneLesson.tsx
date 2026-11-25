import { Pager, Separator, Stack } from '@reactive/silk-native';
import { StyleSheet, View } from 'react-native';

import { useSections } from '@/components/Eyebrow';
import { ScoresheetReview } from '@/components/ReviewLinks';
import { ScoresheetPage } from '@/components/ScoresheetDrawer';
import { FadingScroll, useNarrowPart } from '@/theme/Narrow';

import { CandidateList, COMPACT_INSET } from '../CandidateList';
import { IdeaAside, IdeaCard } from '../IdeaCard';
import { PointingArea } from '../PointingArea';
import { headlineNews } from '../status';
import { TrapCard } from '../TrapCard';
import type { LessonScreenModel } from '../useLessonScreen';
import { LessonHeadline } from './LessonHeadline';

/** The pages under the board on a phone, side by side: the lesson, and its scoresheet. */
export type PhonePage = 'lesson' | 'scoresheet';

/**
 * The lesson under the board on a phone: a short headline, then two pages
 * that the move pill or a sideways swipe slides between (`usePages` owns
 * which shows). One holds the moves and the idea in panes side by side,
 * each scrolling on its own, with a hairline between them; past the guide,
 * where Stockfish's moves stand in, the idea's pane tells why. The other is
 * the scoresheet. Both stay mounted, so the panes keep where they're
 * scrolled to and the notes opened in them.
 */
export function PhoneLesson({
  model,
  page,
  onPage,
  scoresheetReachable,
}: {
  readonly model: LessonScreenModel;
  readonly page: PhonePage;
  readonly onPage: (page: PhonePage) => void;
  /** Whether a swipe can reach the scoresheet's page, as the pill can. */
  readonly scoresheetReachable: boolean;
}) {
  const part = useNarrowPart();
  const sections = useSections();
  const { moves, idea, aside } = model;
  // The pane beside the moves: the idea, else past the guide the headline's why.
  const ideaPane = idea ? (
    <IdeaCard {...idea} density="compact" />
  ) : aside ? (
    // The headline tells it to screen readers.
    <View aria-hidden>
      <IdeaAside {...aside} />
    </View>
  ) : null;
  return (
    <Stack {...part('drawer-panel', sections)}>
      <LessonHeadline
        model={model}
        news={headlineNews(model.status, {
          aside: !!aside,
          scoresheetShown: page === 'scoresheet',
          failed: !!model.headline.failure,
        })}
      />
      {/* The pager proposes only its pages' values. */}
      <Pager.Root
        value={page}
        onValueChange={(value) => onPage(value as PhonePage)}
        style={styles.pages}
      >
        <Pager.Page value="lesson" style={[styles.page, sections]}>
          {model.trap ? <TrapCard {...model.trap} /> : null}
          {/* Leaving a row for the idea keeps its preview, so its notes can be pointed at. */}
          {/* Practice can hide both, and then the panes take no room. */}
          {moves || ideaPane ? (
            <PointingArea onLeave={model.onLeave} style={styles.panes}>
              {moves ? (
                <FadingScroll style={[ideaPane ? styles.moves : styles.pane, styles.bleed]}>
                  <CandidateList {...moves} density="compact" />
                </FadingScroll>
              ) : null}
              {moves && ideaPane ? (
                <Separator orientation="vertical" style={styles.hairline} />
              ) : null}
              {ideaPane ? (
                <FadingScroll style={styles.pane} contentStyle={styles.idea}>
                  {ideaPane}
                </FadingScroll>
              ) : null}
            </PointingArea>
          ) : null}
        </Pager.Page>
        <Pager.Page value="scoresheet" disabled={!scoresheetReachable} style={styles.page}>
          <ScoresheetPage
            {...model.scoresheet}
            reviewButton={
              <ScoresheetReview href={model.review.href} disabled={model.review.shut} compact />
            }
          />
        </Pager.Page>
      </Pager.Root>
    </Stack>
  );
}

/** The pages' least height: a few moves. Below it the panel scrolls instead. */
const PAGES_FLOOR = 140;

const styles = StyleSheet.create({
  // They grow from their floor into what the panel leaves under the headline:
  // a zero height would grow to their content natively, in the panel's scroll view.
  // Out into the page's margin by the rows' bleed, which the pager would clip, and the pages back in.
  pages: {
    flexGrow: 1,
    flexShrink: 1,
    minHeight: PAGES_FLOOR,
    height: PAGES_FLOOR,
    marginHorizontal: -COMPACT_INSET,
  },
  // A page and its panes take the pages' height and no more, so each pane scrolls within.
  page: { flexGrow: 1, flexShrink: 1, minHeight: 0, paddingHorizontal: COMPACT_INSET },
  panes: { flexGrow: 1, flexShrink: 1, flexDirection: 'row', minHeight: 0 },
  // As wide as its rows need, up to half.
  moves: { flexGrow: 0, flexShrink: 0, maxWidth: '50%' },
  // A pane grows from no width to what the others leave: alone, all of it.
  pane: { flexGrow: 1, flexShrink: 1, width: 0, minWidth: 0 },
  // The rows' highlight reaches into the page's margin, so their moves line up with the headline.
  bleed: { marginLeft: -COMPACT_INSET },
  hairline: { marginTop: 6, marginBottom: 20, marginLeft: 6, marginRight: 14 },
  idea: { paddingTop: 2 },
});
