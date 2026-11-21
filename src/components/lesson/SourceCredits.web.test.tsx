// Renders Silk, which ships ES modules: the web project's transformIgnorePatterns
// (package.json) lets @reactive through Babel for it.
import { describe, expect, it } from '@jest/globals';
import { SilkProvider } from '@reactive/silk-native';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import type { LessonSource } from '@/lesson/lesson';
import { FIXTURE_INDEX } from '@/lesson/openings.fixture';
import { LessonIndexContext } from '@/resources/lesson';
import { themes } from '@/theme/theme';

import { SourceCredits } from './SourceCredits';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const study = (title: string, id: string): LessonSource => ({
  title,
  author: 'Matkun',
  url: `https://lichess.org/study/${id}`,
});

function credits(sources: readonly LessonSource[], indexed: readonly LessonSource[]) {
  const index = { ...FIXTURE_INDEX, slav: { ...FIXTURE_INDEX.slav, sources: indexed } };
  const host = document.createElement('div');
  const root = createRoot(host);
  act(() =>
    root.render(
      <SilkProvider theme={themes.dark}>
        <LessonIndexContext value={index}>
          <SourceCredits sources={sources} />
        </LessonIndexContext>
      </SilkProvider>,
    ),
  );
  const text = host.textContent;
  act(() => root.unmount());
  return text;
}

describe('SourceCredits', () => {
  it("names a lesson's study by its author when no other credited study shares the author", () => {
    const slav = study('Slav', 'slav');
    expect(credits([slav], [slav])).toBe("Lesson from Matkun's lichess study");
  });

  it('names it by its title where another lesson credits the same author', () => {
    expect(credits([study('Loaded', 'loaded')], [study('Slav', 'slav')])).toBe(
      'Lesson from Loaded by Matkun',
    );
  });

  it('names two studies by one author by their titles though the index has neither', () => {
    expect(credits([study('Loaded', 'loaded'), study('Other', 'other')], [])).toBe(
      'Lesson from Loaded by Matkun and Other by Matkun',
    );
  });
});
