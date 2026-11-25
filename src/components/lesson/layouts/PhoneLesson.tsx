import { Separator } from '@reactive/silk-native';
import { StyleSheet, View } from 'react-native';

import { type PhonePage, PhonePages } from '@/components/PhonePages';
import { ScoresheetReview } from '@/components/ReviewLinks';
import { FadingScroll } from '@/theme/Narrow';

import { CandidateList, COMPACT_INSET } from '../CandidateList';
import { ActsCard, OpportunityCard } from '../CueActs';
import { IdeaAside, IdeaCard } from '../IdeaCard';
import { PointingArea } from '../PointingArea';
import { headlineNews } from '../status';
import { TrapCard } from '../TrapCard';
import type { LessonScreenModel } from '../useLessonScreen';
import { LessonHeadline } from './LessonHeadline';

/**
 * The lesson under the board on a phone: a short headline, any trap's
 * warning or cue's card, then two pages that the move pill or a sideways
 * swipe slides between (`usePages` owns which shows). One holds the moves and the idea
 * in panes side by side, each scrolling on its own, with a hairline between
 * them; past the guide, where Stockfish's moves stand in, the idea's pane
 * tells why. The other is the scoresheet. Both stay mounted, so the panes
 * keep where they're scrolled to and the notes opened in them.
 */
export function PhoneLesson({
  model,
  page,
  onPage,
  scoresheetReachable,
}: {
  readonly model: LessonScreenModel;
  readonly page: PhonePage<'lesson'>;
  readonly onPage: (page: PhonePage<'lesson'>) => void;
  /** Whether a swipe can reach the scoresheet's page, as the pill can. */
  readonly scoresheetReachable: boolean;
}) {
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
    <PhonePages
      head={
        <>
          <LessonHeadline
            model={model}
            news={headlineNews(model.status, {
              aside: !!aside,
              scoresheetShown: page === 'scoresheet',
              failed: !!model.headline.failure,
            })}
          />
          {/*
           * Above the pages, where the panel scrolls, so a long one is never clipped in a page.
           * It stays over the scoresheet too: the trap is in the position on the board.
           */}
          {model.trap ? <TrapCard {...model.trap} /> : null}
          {model.acts ? <ActsCard acts={model.acts} /> : null}
          {model.opportunity ? <OpportunityCard {...model.opportunity} /> : null}
        </>
      }
      home="lesson"
      page={page}
      onPage={onPage}
      scoresheet={{
        ...model.scoresheet,
        reviewButton: (
          <ScoresheetReview href={model.review.href} disabled={model.review.shut} compact />
        ),
      }}
      scoresheetReachable={scoresheetReachable}
      // Room in the page's margin for the rows' highlight (`styles.bleed`), which the pager would clip.
      bleed={COMPACT_INSET}
    >
      {/* Leaving a row for the idea keeps its preview, so its notes can be pointed at. */}
      {/* Practice can hide both, and then the panes take no room. */}
      {moves || ideaPane ? (
        <PointingArea onLeave={model.onLeave} style={styles.panes}>
          {moves ? (
            <FadingScroll style={[ideaPane ? styles.moves : styles.pane, styles.bleed]}>
              <CandidateList {...moves} density="compact" />
            </FadingScroll>
          ) : null}
          {moves && ideaPane ? <Separator orientation="vertical" style={styles.hairline} /> : null}
          {ideaPane ? (
            <FadingScroll style={styles.pane} contentStyle={styles.idea}>
              {ideaPane}
            </FadingScroll>
          ) : null}
        </PointingArea>
      ) : null}
    </PhonePages>
  );
}

const styles = StyleSheet.create({
  // A page's panes take its height and no more, so each pane scrolls within.
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
