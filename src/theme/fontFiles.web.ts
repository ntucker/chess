import { type FontFamily, fonts } from './theme';

/** fontFiles.ts's fonts as the web loads them: WOFF2 copies (scripts/make-web-fonts.py). */
/* eslint-disable @typescript-eslint/no-require-imports -- Metro bundles an asset for each static require. */
export const FONT_FILES: Record<FontFamily, number> = {
  [fonts.display]: require('@/assets/fonts/web/DMSerifDisplay_400Regular.woff2'),
  [fonts.displayItalic]: require('@/assets/fonts/web/DMSerifDisplay_400Regular_Italic.woff2'),
  [fonts.text]: require('@/assets/fonts/web/InstrumentSans_400Regular.woff2'),
  [fonts.mono]: require('@/assets/fonts/web/DMMono_400Regular.woff2'),
  [fonts.figurines]: require('@/assets/fonts/web/Figurines.woff2'),
};
/* eslint-enable @typescript-eslint/no-require-imports */
