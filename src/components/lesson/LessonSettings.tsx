import { Stack } from '@reactive/silk-native';
import type { ComponentProps } from 'react';

import { useSections } from '@/components/Eyebrow';
import { Sheet } from '@/components/Sheet';
import { SourceFootnote } from '@/components/SourceLink';
import { OpponentStrength } from '@/components/StrengthSlider';
import { ThemeChoice } from '@/components/ThemeSwitch';
import type { Color } from '@/game/replay';
import type { LessonSource } from '@/lesson/lesson';

import { LessonControls } from './LessonControls';
import { SideChoice } from './SideChoice';
import { SourceCredits } from './SourceCredits';

interface Props extends ComponentProps<typeof LessonControls> {
  /** Whether the sheet shows (`Sheet`). */
  readonly open: boolean;
  readonly onClose: () => void;
  /** The side the learner plays, and what plays the other from its start (`SideChoice`). */
  readonly learner: Color;
  readonly onPlayAs: (side: Color) => void;
  /** The lesson's sources, credited at the sheet's foot. */
  readonly sources: readonly LessonSource[];
}

/**
 * A phone's lesson settings, in a sheet: the theme beside its title, then
 * the side the learner plays, the lesson's switches, the opponent's
 * strength, and the sources. A wide page shows these around the board, and
 * its header has the theme, so the sheet is a phone's alone.
 */
export function LessonSettings({ open, onClose, learner, onPlayAs, sources, ...controls }: Props) {
  const sections = useSections();
  return (
    <Sheet open={open} title="Settings" aside={<ThemeChoice />} onClose={onClose}>
      <Stack style={sections}>
        {/* A phone's name-bar discs are dots too small to find; this swaps sides from the sheet, in a lesson too. */}
        <SideChoice side={learner} onChange={onPlayAs} />
        <LessonControls {...controls} />
        <OpponentStrength />
        <SourceCredits sources={sources} />
        <SourceFootnote />
      </Stack>
    </Sheet>
  );
}
