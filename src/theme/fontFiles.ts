import { DMMono_400Regular } from '@expo-google-fonts/dm-mono';
import {
  DMSerifDisplay_400Regular,
  DMSerifDisplay_400Regular_Italic,
} from '@expo-google-fonts/dm-serif-display';
import { InstrumentSans_400Regular } from '@expo-google-fonts/instrument-sans';

import { type FontFamily, fonts } from './theme';

/**
 * The app's font files by family name, loaded at startup (src/app/_layout.tsx):
 * TTFs, which Android reads. The web loads smaller copies (fontFiles.web.ts).
 */
export const FONT_FILES: Record<FontFamily, number> = {
  [fonts.display]: DMSerifDisplay_400Regular,
  [fonts.displayItalic]: DMSerifDisplay_400Regular_Italic,
  [fonts.text]: InstrumentSans_400Regular,
  [fonts.mono]: DMMono_400Regular,
  [fonts.figurines]: require('@/assets/fonts/Figurines.ttf'),
};
