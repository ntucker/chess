// Renders Silk, which ships ES modules: the web project's transformIgnorePatterns
// (package.json) lets @reactive through Babel for it.
import { describe, expect, it, jest } from '@jest/globals';
import { SilkProvider } from '@reactive/silk-native';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import type { Uci } from '@/lesson/lesson';
import { readShippedLesson } from '@/lesson/lesson.fixture';
import { lessonOpportunities } from '@/lesson/opportunities';
import { positionHash, UNTOUCHED } from '@/progress/progress';
import { SettingsProvider } from '@/settings/SettingsProvider';
import { themes } from '@/theme/theme';

import { OpportunityList } from './OpportunityList';

// Its font needs Expo's asset registry too.
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const STAFFORD = readShippedLesson('stafford');
/** The 1400 band, which the finder's limits were tuned at. */
const BAND = 2;

type Props = Parameters<typeof OpportunityList>[0];

/** Renders the Stafford lesson's list with `props`, and reads its host with `read`. */
function render<T>(props: Partial<Props>, read: (host: HTMLElement) => T): T {
  const host = document.createElement('div');
  const root = createRoot(host);
  act(() =>
    root.render(
      <SilkProvider theme={themes.dark}>
        <SettingsProvider>
          <OpportunityList
            lesson={STAFFORD}
            band={BAND}
            progress={UNTOUCHED}
            tip="What the list ranks"
            onPlay={() => {}}
            density="comfortable"
            {...props}
          />
        </SettingsProvider>
      </SilkProvider>,
    ),
  );
  const result = read(host);
  act(() => root.unmount());
  return result;
}

const labels = (props: Partial<Props> = {}) =>
  render(props, (host) =>
    [...host.querySelectorAll('[role="button"]')].map((row) => row.getAttribute('aria-label')),
  );

describe('OpportunityList', () => {
  const ranked = lessonOpportunities(STAFFORD, BAND);

  it('lists the ranked opportunities, each saying its meters aloud', () => {
    const said = labels();
    expect(said).toHaveLength(ranked.length);
    const bg5 = said.find((label) => label?.includes('6.Bg5'));
    expect(bg5).toMatch(/reached in \d+% of games, played 15% of the time, punished with mate$/);
  });

  it("plays a row's line when it is pressed", () => {
    const onPlay = jest.fn<(line: readonly Uci[]) => void>();
    render({ onPlay }, (host) => {
      act(() => host.querySelector<HTMLElement>('[role="button"]')!.click());
    });
    expect(onPlay).toHaveBeenCalledWith(ranked[0].line);
  });

  it('marks a row seen once its cue was shown', () => {
    const progress = { seen: [positionHash(ranked[0].next)], passed: [] };
    expect(labels({ progress })[0]).toMatch(/, seen$/);
  });
});
