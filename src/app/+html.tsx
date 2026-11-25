import { ScrollViewStyleReset, useServerDocumentContext } from 'expo-router/html';
import type { ReactNode } from 'react';

import { SAVED_SIDE_CSS, SAVED_SIDE_SCRIPT } from '@/components/savedSide';
import { BASE_PATH } from '@/files/basePath';
import { barMeta } from '@/theme/barColor';
import { PRE_PAINT_SCRIPT, SCHEME_CSS } from '@/theme/schemeCss';

/**
 * Each web page's HTML document, rendered only by the export: Expo's own,
 * plus the theme's colors per scheme and the script that picks the
 * learner's before the page first paints (src/theme/schemeCss.ts), the
 * side they last played, which turns the home page's still board
 * (src/components/savedSide.ts), the
 * browser bars' color in each (src/theme/barColor.ts), and the manifest that
 * lets a phone add the site to its home screen as an app
 * (public/manifest.webmanifest, written by scripts/make-brand.mjs).
 */
export default function Root({ children }: { readonly children: ReactNode }) {
  const { bodyAttributes, bodyNodes, htmlAttributes, headNodes } = useServerDocumentContext();
  return (
    <html lang="en" {...htmlAttributes}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta {...barMeta('light')} />
        <meta {...barMeta('dark')} />
        <link rel="manifest" href={`${BASE_PATH}/manifest.webmanifest`} />
        <ScrollViewStyleReset />
        <style id="scheme" dangerouslySetInnerHTML={{ __html: SCHEME_CSS }} />
        <script dangerouslySetInnerHTML={{ __html: PRE_PAINT_SCRIPT }} />
        <style id="saved-side" dangerouslySetInnerHTML={{ __html: SAVED_SIDE_CSS }} />
        <script dangerouslySetInnerHTML={{ __html: SAVED_SIDE_SCRIPT }} />
        {headNodes}
      </head>
      <body {...bodyAttributes}>
        {children}
        {bodyNodes}
      </body>
    </html>
  );
}
