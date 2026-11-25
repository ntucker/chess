import { Inline, Separator, Stack } from '@reactive/silk-native';

import { useLabelled, useSections } from '@/components/Eyebrow';
import { OpponentChoice } from '@/components/OpponentChoice';
import { Scoresheet, ScoresheetTitle } from '@/components/Scoresheet';
import { ScoresheetReview } from '@/components/ReviewLinks';

import { CandidateList } from '../CandidateList';
import { ActsCard, OpportunityCard } from '../CueActs';
import { IdeaCard } from '../IdeaCard';
import { LessonControls } from '../LessonControls';
import { OpportunityList } from '../OpportunityList';
import { PointingArea } from '../PointingArea';
import { TrapCard } from '../TrapCard';
import type { LessonScreenModel } from '../useLessonScreen';
import { LessonHeadline } from './LessonHeadline';

/**
 * The lesson's panel beside the board: the headline, any trap or cue's card,
 * the moves over the idea, any list of opportunities, the scoresheet, then
 * the settings.
 */
export function WideLesson({ model }: { readonly model: LessonScreenModel }) {
  const labelled = useLabelled();
  const sections = useSections();
  return (
    <Stack style={sections}>
      <LessonHeadline model={model} />
      <Separator />
      {model.trap ? <TrapCard {...model.trap} /> : null}
      {model.acts ? <ActsCard acts={model.acts} /> : null}
      {model.opportunity ? <OpportunityCard {...model.opportunity} /> : null}
      {/* Leaving a row for the idea card keeps its preview, so its notes can be pointed at. */}
      {model.moves || model.idea ? (
        <PointingArea onLeave={model.onLeave} style={sections}>
          {model.moves ? <CandidateList {...model.moves} density="comfortable" /> : null}
          {model.idea ? <IdeaCard {...model.idea} density="comfortable" /> : null}
        </PointingArea>
      ) : null}
      {model.opportunities ? (
        <>
          <Separator />
          <OpportunityList {...model.opportunities} density="comfortable" />
        </>
      ) : null}
      <Separator />
      <Stack style={labelled}>
        <Inline align="center" justify="between" wrap="nowrap">
          <ScoresheetTitle />
          <ScoresheetReview {...model.review.button} />
        </Inline>
        <Scoresheet {...model.scoresheet} />
      </Stack>
      <Separator />
      <LessonControls {...model.settings} />
      <OpponentChoice />
    </Stack>
  );
}
