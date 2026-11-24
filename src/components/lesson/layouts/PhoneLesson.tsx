import { Separator, Stack } from '@reactive/silk-native';
import { Activity } from 'react';
import { StyleSheet, View } from 'react-native';

import { useSections } from '@/components/Eyebrow';
import { ScoresheetReview } from '@/components/ReviewLinks';
import { ScoresheetDrawer } from '@/components/ScoresheetDrawer';
import { FadingScroll, useNarrowPart } from '@/theme/Narrow';

import { CandidateList, COMPACT_INSET } from '../CandidateList';
import { IdeaAside, IdeaCard } from '../IdeaCard';
import { PointingArea } from '../PointingArea';
import { headlineNews } from '../status';
import { TrapCard } from '../TrapCard';
import type { LessonScreenModel } from '../useLessonScreen';
import { LessonHeadline } from './LessonHeadline';

/**
 * The lesson under the board on a phone: a short headline, then the moves
 * and the idea in panes side by side, each scrolling on its own, with a
 * hairline between them; or, while `scoresheetOpen`, the scoresheet in
 * their place. Past the guide, where Stockfish's moves stand in, the idea's
 * pane tells why.
 */
export function PhoneLesson({
  model,
  scoresheetOpen,
  onCloseScoresheet,
}: {
  readonly model: LessonScreenModel;
  readonly scoresheetOpen: boolean;
  readonly onCloseScoresheet: () => void;
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
          scoresheetOpen,
          failed: !!model.headline.failure,
        })}
      />
      {scoresheetOpen ? (
        <ScoresheetDrawer
          {...model.scoresheet}
          reviewButton={
            <ScoresheetReview href={model.review.href} disabled={model.review.shut} compact />
          }
          onClose={onCloseScoresheet}
        />
      ) : null}
      {/*
       * Hidden under the scoresheet, not unmounted, so the panes keep where
       * they're scrolled to and the notes opened in them.
       */}
      <Activity mode={scoresheetOpen ? 'hidden' : 'visible'}>
        {model.trap ? <TrapCard {...model.trap} /> : null}
        {/* Leaving a row for the idea keeps its preview, so its notes can be pointed at. */}
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
      </Activity>
    </Stack>
  );
}

/** The panes' least height: a few moves. Below it the panel scrolls instead. */
const PANES_FLOOR = 140;

const styles = StyleSheet.create({
  // They grow from their floor into what the panel leaves under the headline:
  // a zero height would grow to their content natively, in the panel's scroll view.
  panes: {
    flexGrow: 1,
    flexShrink: 1,
    flexDirection: 'row',
    minHeight: PANES_FLOOR,
    height: PANES_FLOOR,
  },
  // As wide as its rows need, up to half.
  moves: { flexGrow: 0, flexShrink: 0, maxWidth: '50%' },
  // A pane grows from no width to what the others leave: alone, all of it.
  pane: { flexGrow: 1, flexShrink: 1, width: 0, minWidth: 0 },
  // The rows' highlight reaches into the page's margin, so their moves line up with the headline.
  bleed: { marginLeft: -COMPACT_INSET },
  hairline: { marginTop: 6, marginBottom: 20, marginLeft: 6, marginRight: 14 },
  idea: { paddingTop: 2 },
});
