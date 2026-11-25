import { Separator } from '@reactive/silk-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { type PhonePage, PhonePages } from '@/components/PhonePages';
import { ScoresheetReview } from '@/components/ReviewLinks';
import { FadingScroll } from '@/theme/Narrow';

import { CandidateList, COMPACT_INSET } from '../CandidateList';
import { ActsCard, OpportunityCard } from '../CueActs';
import { IdeaAside, IdeaCard } from '../IdeaCard';
import { OpportunityList } from '../OpportunityList';
import { PointingArea } from '../PointingArea';
import { headlineNews } from '../status';
import { TrapCard } from '../TrapCard';
import type { LessonScreenModel } from '../useLessonScreen';
import { LessonHeadline } from './LessonHeadline';

/** A lesson's pages on a phone, besides the scoresheet. */
export type LessonPageName = 'lesson' | 'opportunities';

/**
 * The lesson under the board on a phone: a short headline, any trap's
 * warning or cue's card, then pages that the move pill or a sideways swipe
 * slides between (`usePages` owns which shows). The lesson's holds the
 * moves and the idea in panes side by side, each scrolling on its own, with
 * a hairline between them; past the guide, where Stockfish's moves stand in,
 * the idea's pane tells why. One swipe before it, where the lesson marks the
 * other side's mistakes, the list of opportunities, worked out the first
 * time it shows (a big lesson's takes a moment); one after it, the
 * scoresheet. All stay mounted, so the panes keep where they're scrolled to
 * and the notes opened in them.
 */
export function PhoneLesson({
  model,
  page,
  onPage,
  scoresheetReachable,
}: {
  readonly model: LessonScreenModel;
  readonly page: PhonePage<LessonPageName>;
  readonly onPage: (page: PhonePage<LessonPageName>) => void;
  /** Whether a swipe can reach the scoresheet's page, as the pill can. */
  readonly scoresheetReachable: boolean;
}) {
  const { moves, idea, aside, opportunities } = model;
  // Once shown, the list stays, so swiping back to it is instant.
  const [listed, setListed] = useState(false);
  if (page === 'opportunities' && !listed) setListed(true);
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
      before={
        opportunities
          ? {
              page: 'opportunities',
              children: listed ? (
                <FadingScroll style={styles.list}>
                  <OpportunityList
                    {...opportunities}
                    // Back to the lesson's page, where the cue's moves and idea show.
                    onPlay={(line) => {
                      opportunities.onPlay(line);
                      onPage('lesson');
                    }}
                    density="compact"
                  />
                </FadingScroll>
              ) : null,
            }
          : undefined
      }
      home="lesson"
      page={page}
      onPage={onPage}
      scoresheet={{
        ...model.scoresheet,
        reviewButton: <ScoresheetReview {...model.review.button} compact />,
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
  // The list takes the page's height and no more, so it scrolls within.
  list: { flexGrow: 1, flexShrink: 1, minHeight: 0 },
  // The rows' highlight reaches into the page's margin, so their moves line up with the headline.
  bleed: { marginLeft: -COMPACT_INSET },
  hairline: { marginTop: 6, marginBottom: 20, marginLeft: 6, marginRight: 14 },
  idea: { paddingTop: 2 },
});
